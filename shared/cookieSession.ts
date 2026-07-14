import { timingSafeEqual } from "node:crypto";

// Replicates React Router's cookie signing algorithm (HMAC-SHA256 via Web Crypto API)
// Format: `${rawValue}.${base64Signature}`
async function unsign(signed: string, secret: string): Promise<string | false> {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot < 0) return false;

  const value = signed.slice(0, lastDot);
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(
    /=+$/,
    "",
  );
  const expected = `${value}.${expectedSig}`;

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signed, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b) ? value : false;
  } catch {
    return false;
  }
}

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    try {
      result[name] = decodeURIComponent(val);
    } catch {
      result[name] = val;
    }
  }
  return result;
}

// Bug fix: this used to be plain `atob(value)`, matching a header comment
// that claimed React Router serialises the session as
// `btoa(JSON.stringify(data))`. The actual algorithm (confirmed against
// node_modules/react-router's own decodeData/encodeData) is UTF-8-safe:
// `btoa(unescape(encodeURIComponent(JSON.stringify(value))))`, reversed
// here as `JSON.parse(decodeURIComponent(escape(atob(value))))`. Plain
// atob() happened to work only because session payloads (did, handle) are
// always ASCII — encodeURIComponent/unescape are no-ops on pure ASCII
// input, so the simplified and real encodings coincided by luck. Any
// future session field containing non-ASCII characters would have
// corrupted or failed to decode under the old version.
function decodeSessionValue(value: string): unknown {
  return JSON.parse(decodeURIComponent(escape(atob(value))));
}

/**
 * Verifies a Scribe ATP `__session` cookie and returns the authenticated DID,
 * or null if the cookie is absent, tampered, or malformed.
 *
 * React Router serialises the session as
 * `btoa(unescape(encodeURIComponent(JSON.stringify(data))))` before signing
 * — the encoding happens before the HMAC, not after. This is the first
 * thing to check when debugging 401s from the Image Service despite a
 * correct SESSION_SECRET.
 */
export async function verifyScribeSession(
  cookieHeader: string | undefined,
  secret: string,
): Promise<string | null> {
  if (!cookieHeader) return null;

  const cookies = parseCookies(cookieHeader);
  const sessionValue = cookies["__session"];
  if (!sessionValue) return null;

  const unsigned = await unsign(sessionValue, secret);
  if (!unsigned) return null;

  try {
    const data = decodeSessionValue(unsigned) as Record<string, unknown>;
    return typeof data.did === "string" ? data.did : null;
  } catch {
    return null;
  }
}
