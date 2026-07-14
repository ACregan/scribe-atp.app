import { describe, it, expect } from "vitest";
import { verifyScribeSession } from "./cookieSession";

// Replicates the signing side of React Router's cookie format so tests can
// produce valid cookies without depending on the framework internals.
async function signSession(
  data: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const value = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const sig = btoa(String.fromCharCode(...new Uint8Array(mac))).replace(
    /=+$/,
    "",
  );
  return `${value}.${sig}`;
}

function cookieHeader(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}`;
}

const SECRET = "test-session-secret-at-least-32-chars!";
const DID = "did:plc:testuser123";

describe("verifyScribeSession", () => {
  it("returns DID for a valid session cookie", async () => {
    const signed = await signSession(
      { did: DID, handle: "test.bsky.social" },
      SECRET,
    );
    expect(
      await verifyScribeSession(cookieHeader("__session", signed), SECRET),
    ).toBe(DID);
  });

  it("returns null when cookieHeader is undefined", async () => {
    expect(await verifyScribeSession(undefined, SECRET)).toBeNull();
  });

  it("returns null when __session cookie is absent", async () => {
    expect(
      await verifyScribeSession("other_cookie=some_value", SECRET),
    ).toBeNull();
  });

  it("returns null when the signature is tampered", async () => {
    const signed = await signSession({ did: DID }, SECRET);
    const tampered = signed.slice(0, -4) + "AAAA";
    expect(
      await verifyScribeSession(cookieHeader("__session", tampered), SECRET),
    ).toBeNull();
  });

  it("returns null when signed with a different secret", async () => {
    const signed = await signSession({ did: DID }, "wrong-secret");
    expect(
      await verifyScribeSession(cookieHeader("__session", signed), SECRET),
    ).toBeNull();
  });

  it("returns null when payload has no DID field", async () => {
    const signed = await signSession({ handle: "test.bsky.social" }, SECRET);
    expect(
      await verifyScribeSession(cookieHeader("__session", signed), SECRET),
    ).toBeNull();
  });

  it("returns null when DID is not a string", async () => {
    const signed = await signSession({ did: 42 }, SECRET);
    expect(
      await verifyScribeSession(cookieHeader("__session", signed), SECRET),
    ).toBeNull();
  });

  it("handles multiple cookies in the header", async () => {
    const signed = await signSession({ did: DID }, SECRET);
    const header = `other=abc; __session=${encodeURIComponent(signed)}; more=xyz`;
    expect(await verifyScribeSession(header, SECRET)).toBe(DID);
  });

  it("bug fix: decodes correctly when the payload contains non-ASCII characters", async () => {
    // Plain atob()/btoa() only ever worked here because real session
    // payloads happen to be ASCII-only — this test puts a non-ASCII
    // character directly in the checked `did` field so a decode that
    // silently mangles UTF-8 (the old atob()-only path did this, rather
    // than throwing) actually fails the assertion instead of passing
    // coincidentally.
    const nonAsciiDid = "did:plc:tëst日本語";
    const signed = await signSession({ did: nonAsciiDid }, SECRET);
    expect(
      await verifyScribeSession(cookieHeader("__session", signed), SECRET),
    ).toBe(nonAsciiDid);
  });
});
