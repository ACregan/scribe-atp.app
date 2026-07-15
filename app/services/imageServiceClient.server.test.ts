import { describe, it, expect, vi, afterEach } from "vitest";
import { browseImages, syncSiteRoster } from "./imageServiceClient.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browseImages", () => {
  it("forwards the cookie header and constructs the folderId query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ folder: null, breadcrumbs: [], subfolders: [], images: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await browseImages("42", "__session=abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3009/api/image-service/browse?folderId=42",
      expect.objectContaining({ headers: { Cookie: "__session=abc" } }),
    );
  });

  it("throws when the Image Service responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(browseImages(null, "__session=abc")).rejects.toThrow("500");
  });
});

describe("syncSiteRoster", () => {
  const SITE_URI = "at://did:plc:owner/site.standard.publication/my-site";

  it("PUTs the site roster with the correct body and cookie forwarding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await syncSiteRoster(SITE_URI, "example.com", ["did:plc:a", "did:plc:b"], "__session=abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3009/api/image-service/site-roster",
      expect.objectContaining({
        method: "PUT",
        headers: { Cookie: "__session=abc", "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUri: SITE_URI,
          siteName: "example.com",
          memberDids: ["did:plc:a", "did:plc:b"],
        }),
      }),
    );
  });

  it("throws when the Image Service responds with a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(syncSiteRoster(SITE_URI, "example.com", [], "__session=abc")).rejects.toThrow("403");
  });
});
