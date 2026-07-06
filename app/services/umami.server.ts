import dns from "node:dns/promises";
import net from "node:net";
import { umamiConfigStore, type UmamiConfig } from "./db.server";
import { logger } from "./logger.server";

export type { UmamiConfig };

const FETCH_TIMEOUT_MS = 5000;

// ── SSRF guard (ADR 0011) ────────────────────────────────────────────────────
//
// Base URL is user-supplied and fetched server-side on every test-connection
// and every Insights-page load. Re-resolve and re-check on every call, not
// just at save time — a hostname that resolved safely once could later be
// repointed at an internal address.

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

// ── Connection test ──────────────────────────────────────────────────────────

export type UmamiTestResult =
  | { ok: true; websiteName: string }
  | { ok: false; error: string };

export async function testUmamiConnection(
  baseUrl: string,
  websiteId: string,
  apiKey: string,
): Promise<UmamiTestResult> {
  try {
    await assertPublicHost(baseUrl);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid URL.",
    };
  }

  try {
    const res = await fetch(apiUrl(baseUrl, `/api/websites/${websiteId}`), {
      headers: { "x-umami-api-key": apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Umami rejected the API key." };
    }
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

export type UmamiDayPoint = { date: string; pageviews: number };

export async function fetchUmamiPageviews(
  config: UmamiConfig,
  fromMs: number,
  toMs: number,
): Promise<UmamiDayPoint[]> {
  await assertPublicHost(config.baseUrl);

  const url = new URL(
    apiUrl(config.baseUrl, `/api/websites/${config.websiteId}/pageviews`),
  );
  url.searchParams.set("startAt", String(fromMs));
  url.searchParams.set("endAt", String(toMs));
  url.searchParams.set("unit", "day");
  url.searchParams.set("timezone", "UTC");

  const res = await fetch(url.toString(), {
    headers: { "x-umami-api-key": config.apiKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Umami pageviews request failed (${res.status}).`);
  }

  const data = (await res.json()) as { pageviews?: { t: string; y: number }[] };
  return (data.pageviews ?? []).map((p) => ({
    date: p.t.slice(0, 10),
    pageviews: p.y,
  }));
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
  config: { baseUrl: string; websiteId: string; apiKey: string },
): void {
  umamiConfigStore.set(userDid, siteRkey, config);
}

export function deleteUmamiConfig(userDid: string, siteRkey: string): void {
  umamiConfigStore.del(userDid, siteRkey);
}
