import { timingSafeEqual } from "node:crypto";

// Replicates React Router's cookie signing algorithm (HMAC-SHA256 via Web Crypto API)
// Format of a signed cookie value: `${rawValue}.${base64Signature}`
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
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/=+$/, "");
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

export async function getSessionDid(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const cookies = parseCookies(cookieHeader);
  const sessionValue = cookies["__session"];
  if (!sessionValue) return null;

  const unsigned = await unsign(sessionValue, secret);
  if (!unsigned) return null;

  try {
    const data = JSON.parse(unsigned) as Record<string, unknown>;
    return typeof data.did === "string" ? data.did : null;
  } catch {
    return null;
  }
}
