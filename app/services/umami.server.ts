import dns from "node:dns/promises";
import net from "node:net";
import { umamiConfigStore, type UmamiConfig } from "./db.server";
import { logger } from "./logger.server";

export type { UmamiConfig };

const FETCH_TIMEOUT_MS = 5000;

// ── SSRF guard (ADR 0011) ────────────────────────────────────────────────────
//
// Base URL is user-supplied and fetched server-side on every login and every
// stats/pageviews call. Re-resolve and re-check on every call, not just at
// save time — a hostname that resolved safely once could later be repointed
// at an internal address.

const PRIVATE_IPV4_RANGES: Array<[base: string, bits: number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["0.0.0.0", 8],
];

function ipv4ToInt(ip: string): number {
  return (
    ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
  }
  return false;
}

export class UnsafeUmamiUrlError extends Error {}

async function assertPublicHost(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUmamiUrlError("Not a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUmamiUrlError("URL must use http:// or https://.");
  }
  if (parsed.hostname === "localhost") {
    throw new UnsafeUmamiUrlError("URL may not point to localhost.");
  }

  let addresses: string[];
  if (net.isIP(parsed.hostname)) {
    addresses = [parsed.hostname];
  } else {
    try {
      const records = await dns.lookup(parsed.hostname, { all: true });
      addresses = records.map((r) => r.address);
    } catch {
      throw new UnsafeUmamiUrlError("Could not resolve hostname.");
    }
  }

  for (const address of addresses) {
    const isUnsafe = net.isIPv6(address)
      ? isPrivateIPv6(address)
      : isPrivateIPv4(address);
    if (isUnsafe) {
      throw new UnsafeUmamiUrlError(
        "URL may not point to a private or internal address.",
      );
    }
  }
}

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

// ── Login (ADR 0012) ─────────────────────────────────────────────────────────
//
// Self-hosted Umami has no static API key — auth is POST /api/auth/login
// with { username, password } returning a JWT, used as
// "Authorization: Bearer {token}" on every subsequent request. Confirmed
// empirically against a live Umami v3.1.0 instance.

export class UmamiAuthError extends Error {}

function decodeJwtExpiry(token: string): number | null {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const json = Buffer.from(payloadSegment, "base64url").toString("utf-8");
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

async function loginToUmami(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch(apiUrl(baseUrl, "/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) {
    throw new UmamiAuthError("Umami rejected the username or password.");
  }
  if (!res.ok) {
    throw new UmamiAuthError(`Umami login failed (${res.status}).`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new UmamiAuthError("Umami login response did not include a token.");
  }
  // exp is seconds since epoch (JWT standard claim) — fall back to a
  // conservative 1-hour assumption if the token is missing the claim.
  const expiresAt =
    decodeJwtExpiry(data.token) ?? Math.floor(Date.now() / 1000) + 3600;
  return { token: data.token, expiresAt };
}

const TOKEN_REFRESH_MARGIN_SECONDS = 60;

async function getValidToken(
  userDid: string,
  siteRkey: string,
  config: UmamiConfig,
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    config.cachedJwt &&
    config.jwtExpiresAt &&
    config.jwtExpiresAt - TOKEN_REFRESH_MARGIN_SECONDS > nowSeconds
  ) {
    return config.cachedJwt;
  }
  const { token, expiresAt } = await loginToUmami(
    config.baseUrl,
    config.username,
    config.password,
  );
  umamiConfigStore.setCachedJwt(userDid, siteRkey, token, expiresAt);
  return token;
}

// ── Connection test ──────────────────────────────────────────────────────────

export type UmamiTestResult =
  | { ok: true; websiteName: string }
  | { ok: false; error: string };

export async function testUmamiConnection(
  baseUrl: string,
  websiteId: string,
  username: string,
  password: string,
): Promise<UmamiTestResult> {
  try {
    await assertPublicHost(baseUrl);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid URL.",
    };
  }

  let token: string;
  try {
    const result = await loginToUmami(baseUrl, username, password);
    token = result.token;
  } catch (err) {
    if (err instanceof UmamiAuthError) {
      return { ok: false, error: err.message };
    }
    logger.warn(
      { event: "umami.test_connection_error", error: String(err) },
      "umami.test_connection_error",
    );
    return { ok: false, error: "Could not reach that Umami instance." };
  }

  try {
    const res = await fetch(apiUrl(baseUrl, `/api/websites/${websiteId}`), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) {
      return {
        ok: false,
        error: "Website ID not found on this Umami instance.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `Umami returned an unexpected error (${res.status}).`,
      };
    }
    const data = (await res.json()) as { name?: string; domain?: string };
    return { ok: true, websiteName: data.name || data.domain || websiteId };
  } catch (err) {
    logger.warn(
      { event: "umami.test_connection_error", error: String(err) },
      "umami.test_connection_error",
    );
    return { ok: false, error: "Could not reach that Umami instance." };
  }
}

// ── Pageviews fetch (Insights loader) ────────────────────────────────────────

export type UmamiDayPoint = { date: string; pageviews: number; visitors: number };

async function requestPageviews(
  config: UmamiConfig,
  token: string,
  fromMs: number,
  toMs: number,
): Promise<UmamiDayPoint[] | "unauthorized"> {
  const url = new URL(
    apiUrl(config.baseUrl, `/api/websites/${config.websiteId}/pageviews`),
  );
  url.searchParams.set("startAt", String(fromMs));
  url.searchParams.set("endAt", String(toMs));
  url.searchParams.set("unit", "day");
  url.searchParams.set("timezone", "UTC");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) return "unauthorized";
  if (!res.ok) {
    throw new Error(`Umami pageviews request failed (${res.status}).`);
  }

  // Umami's /pageviews endpoint returns unique visitor counts (per unit) in
  // the same response as a separate "sessions" series — no second request needed.
  const data = (await res.json()) as {
    pageviews?: { x: string; y: number }[];
    sessions?: { x: string; y: number }[];
  };
  const visitorsByDate = new Map(
    (data.sessions ?? []).map((s) => [s.x.slice(0, 10), s.y]),
  );
  return (data.pageviews ?? []).map((p) => ({
    date: p.x.slice(0, 10),
    pageviews: p.y,
    visitors: visitorsByDate.get(p.x.slice(0, 10)) ?? 0,
  }));
}

// Shared by every authenticated Umami request: get a cached token, run the
// request, and if it comes back unauthorized (e.g. the password was changed
// elsewhere, invalidating existing sessions early), force a fresh login and
// retry once before giving up.
async function callWithAuth<T>(
  userDid: string,
  siteRkey: string,
  config: UmamiConfig,
  request: (token: string) => Promise<T | "unauthorized">,
): Promise<T> {
  const token = await getValidToken(userDid, siteRkey, config);
  const result = await request(token);
  if (result !== "unauthorized") return result;

  const { token: freshToken, expiresAt } = await loginToUmami(
    config.baseUrl,
    config.username,
    config.password,
  );
  umamiConfigStore.setCachedJwt(userDid, siteRkey, freshToken, expiresAt);
  const retryResult = await request(freshToken);
  if (retryResult === "unauthorized") {
    throw new Error("Umami rejected the stored credentials.");
  }
  return retryResult;
}

export async function fetchUmamiPageviews(
  userDid: string,
  siteRkey: string,
  config: UmamiConfig,
  fromMs: number,
  toMs: number,
): Promise<UmamiDayPoint[]> {
  await assertPublicHost(config.baseUrl);
  return callWithAuth(userDid, siteRkey, config, (token) =>
    requestPageviews(config, token, fromMs, toMs),
  );
}

// ── Stats summary (bounce rate / avg visit duration) ─────────────────────────
//
// Umami's /stats endpoint returns period summaries — visits, bounces, and
// totaltime (session duration in seconds) — for the given startAt/endAt
// window. Bounce rate and avg visit duration are derived here rather than
// trusting Umami's own dashboard math, so the exact endpoint field names are
// the only assumption riding on this: verify against a live instance before
// treating this as done (see ADR 0012 — the original Umami auth model was
// also assumed from docs and turned out wrong until tested for real).

export type UmamiStatsSummary = {
  visits: number;
  bounces: number;
  totaltimeSeconds: number;
};

async function requestStats(
  config: UmamiConfig,
  token: string,
  fromMs: number,
  toMs: number,
): Promise<UmamiStatsSummary | "unauthorized"> {
  const url = new URL(
    apiUrl(config.baseUrl, `/api/websites/${config.websiteId}/stats`),
  );
  url.searchParams.set("startAt", String(fromMs));
  url.searchParams.set("endAt", String(toMs));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) return "unauthorized";
  if (!res.ok) {
    throw new Error(`Umami stats request failed (${res.status}).`);
  }

  const data = (await res.json()) as {
    visits?: { value?: number };
    bounces?: { value?: number };
    totaltime?: { value?: number };
  };
  return {
    visits: data.visits?.value ?? 0,
    bounces: data.bounces?.value ?? 0,
    totaltimeSeconds: data.totaltime?.value ?? 0,
  };
}

export async function fetchUmamiStats(
  userDid: string,
  siteRkey: string,
  config: UmamiConfig,
  fromMs: number,
  toMs: number,
): Promise<UmamiStatsSummary> {
  await assertPublicHost(config.baseUrl);
  return callWithAuth(userDid, siteRkey, config, (token) =>
    requestStats(config, token, fromMs, toMs),
  );
}

// ── Top pages / referrers ─────────────────────────────────────────────────────
//
// Umami's /metrics endpoint returns a ranked list for a given "type" (url,
// referrer, browser, os, device, country, ...) over a startAt/endAt window,
// pre-sorted by count descending. Same unverified-against-a-live-instance
// caveat as /stats above — field names (x, y) are assumed from Umami's docs.

export type UmamiMetricType = "url" | "referrer";
export type UmamiMetricRow = { label: string; count: number };

async function requestMetrics(
  config: UmamiConfig,
  token: string,
  type: UmamiMetricType,
  fromMs: number,
  toMs: number,
): Promise<UmamiMetricRow[] | "unauthorized"> {
  const url = new URL(
    apiUrl(config.baseUrl, `/api/websites/${config.websiteId}/metrics`),
  );
  url.searchParams.set("type", type);
  url.searchParams.set("startAt", String(fromMs));
  url.searchParams.set("endAt", String(toMs));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) return "unauthorized";
  if (!res.ok) {
    throw new Error(`Umami metrics request failed (${res.status}).`);
  }

  const data = (await res.json()) as { x?: string; y?: number }[];
  return data.map((row) => ({
    // Umami reports direct/no-referrer traffic as an empty string.
    label: row.x || (type === "referrer" ? "Direct" : "/"),
    count: row.y ?? 0,
  }));
}

export async function fetchUmamiMetrics(
  userDid: string,
  siteRkey: string,
  config: UmamiConfig,
  type: UmamiMetricType,
  fromMs: number,
  toMs: number,
  limit: number,
): Promise<UmamiMetricRow[]> {
  await assertPublicHost(config.baseUrl);
  const rows = await callWithAuth(userDid, siteRkey, config, (token) =>
    requestMetrics(config, token, type, fromMs, toMs),
  );
  return rows.slice(0, limit);
}

// ── Config CRUD ──────────────────────────────────────────────────────────────

export function getUmamiConfig(
  userDid: string,
  siteRkey: string,
): UmamiConfig | undefined {
  return umamiConfigStore.get(userDid, siteRkey);
}

export function saveUmamiConfig(
  userDid: string,
  siteRkey: string,
  config: {
    baseUrl: string;
    websiteId: string;
    websiteName: string;
    username: string;
    password: string;
  },
): void {
  umamiConfigStore.set(userDid, siteRkey, config);
}

export function deleteUmamiConfig(userDid: string, siteRkey: string): void {
  umamiConfigStore.del(userDid, siteRkey);
}
