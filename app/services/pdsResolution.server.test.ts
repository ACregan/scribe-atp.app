import { describe, it, expect, vi, afterEach } from "vitest";
import { parseSiteUri, resolveDidPdsUrl } from "./pdsResolution.server";

describe("parseSiteUri", () => {
  it("extracts the owner DID and rkey from an at:// URI", () => {
    expect(
      parseSiteUri("at://did:plc:owner/site.standard.publication/my-site"),
    ).toEqual({ ownerDid: "did:plc:owner", rkey: "my-site" });
  });

  it("is collection-agnostic — works for any at://did/collection/rkey shape", () => {
    expect(
      parseSiteUri("at://did:plc:contributor/site.standard.document/abc123"),
    ).toEqual({ ownerDid: "did:plc:contributor", rkey: "abc123" });
  });

  it("throws on a malformed URI", () => {
    expect(() => parseSiteUri("not-a-uri")).toThrow("Malformed site URI");
  });
});

describe("resolveDidPdsUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a did:plc via plc.directory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            service: [{ id: "#atproto_pds", serviceEndpoint: "https://pds.example" }],
          }),
      }),
    );

    await expect(resolveDidPdsUrl("did:plc:someone")).resolves.toBe(
      "https://pds.example",
    );
  });

  it("resolves a did:web via its own well-known endpoint, not plc.directory", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          service: [{ id: "#atproto_pds", serviceEndpoint: "https://web-pds.example" }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveDidPdsUrl("did:web:example.com")).resolves.toBe(
      "https://web-pds.example",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/.well-known/did.json",
    );
  });

  it("throws when the DID document has no PDS service entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ service: [] }) }),
    );

    await expect(resolveDidPdsUrl("did:plc:no-pds")).rejects.toThrow(
      "No PDS service found",
    );
  });

  it("throws when the DID document fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, statusText: "Not Found" }),
    );

    await expect(resolveDidPdsUrl("did:plc:missing")).rejects.toThrow(
      "Failed to resolve DID document",
    );
  });

  it("caches the resolved PDS URL — a second call for the same DID doesn't re-fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          service: [{ id: "#atproto_pds", serviceEndpoint: "https://cached-pds.example" }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await resolveDidPdsUrl("did:plc:cache-me");
    await resolveDidPdsUrl("did:plc:cache-me");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
