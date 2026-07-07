import { describe, it, expect, afterEach } from "vitest";
import { getSessionDid } from "./auth.js";

// verifyScribeSession's own signing/tamper-detection behaviour is already
// covered in shared/cookieSession.test.ts. This only needs to cover the
// thin wrapper's own logic: delegating when a secret is configured, and the
// short-circuit when it isn't (SESSION_SECRET missing at runtime).

async function signSession(data: Record<string, unknown>, secret: string): Promise<string> {
  const value = btoa(JSON.stringify(data));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const sig = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/=+$/, "");
  return `${value}.${sig}`;
}

const SECRET = "test-session-secret-at-least-32-chars!";
const DID = "did:plc:testuser123";

const originalSecret = process.env.SESSION_SECRET;
afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("getSessionDid", () => {
  it("returns the DID for a valid session cookie when SESSION_SECRET is configured", async () => {
    process.env.SESSION_SECRET = SECRET;
    const signed = await signSession({ did: DID }, SECRET);
    expect(await getSessionDid(`__session=${encodeURIComponent(signed)}`)).toBe(DID);
  });

  it("returns null when SESSION_SECRET is not configured, without attempting verification", async () => {
    delete process.env.SESSION_SECRET;
    const signed = await signSession({ did: DID }, SECRET);
    expect(await getSessionDid(`__session=${encodeURIComponent(signed)}`)).toBeNull();
  });

  it("returns null for a missing cookie header", async () => {
    process.env.SESSION_SECRET = SECRET;
    expect(await getSessionDid(undefined)).toBeNull();
  });
});
