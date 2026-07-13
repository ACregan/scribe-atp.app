import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./sites";
import { requireAuth, getAtpAgent } from "~/services/auth.server";

// Characterization tests for the sites route's real-OAuth path (useRealOAuth:
// true), written against the untouched loader/action before extracting onto
// app/services/siteRepository.server.ts (see the approved plan). Dev-bypass
// path is covered separately in sites.devBypass.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  rethrowIfRedirect: (err: unknown) => {
    if (err instanceof Response) throw err;
  },
  useRealOAuth: true,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DID = "did:plc:testuser";

function makeAgent(
  overrides: {
    listRecords?: ReturnType<typeof vi.fn>;
    createRecord?: ReturnType<typeof vi.fn>;
    deleteRecord?: ReturnType<typeof vi.fn>;
    uploadBlob?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords:
            overrides.listRecords ??
            vi.fn().mockResolvedValue({ data: { records: [] } }),
          createRecord:
            overrides.createRecord ?? vi.fn().mockResolvedValue({ data: {} }),
          deleteRecord:
            overrides.deleteRecord ?? vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    },
    uploadBlob: overrides.uploadBlob ?? vi.fn(),
  } as unknown as Agent;
}

function makeRequest(entries: Record<string, string> = {}): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/sites", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({ request: makeRequest(entries) } as unknown as Parameters<
    typeof action
  >[0]);
}

function callLoader() {
  return loader({
    request: new Request("http://localhost/sites"),
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockReset();
});

describe("loader", () => {
  it("maps site records to SiteCard, filtering out records with no scribe field", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.publication/site-a`,
              cid: "cid-a",
              value: {
                scribe: {
                  title: "Site A",
                  domain: "a.com",
                  basePath: "blog",
                  description: "desc",
                  splashImageUrl: "https://a.com/splash.png",
                  logoImageUrl: "https://a.com/logo.png",
                  groups: [{ articles: [1, 2] }, { articles: [3] }],
                  ungroupedArticles: [1],
                },
              },
            },
            {
              uri: `at://${DID}/site.standard.publication/legacy`,
              cid: "cid-legacy",
              value: {}, // no scribe field — should be filtered out
            },
          ],
        },
      }),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callLoader();

    expect(result).toEqual({
      sites: [
        {
          rkey: "site-a",
          cid: "cid-a",
          title: "Site A",
          url: "a.com",
          urlPrefix: "blog",
          description: "desc",
          splashImageUrl: "https://a.com/splash.png",
          logoImageUrl: "https://a.com/logo.png",
          groupCount: 2,
          articleCount: 4,
        },
      ],
    });
  });

  it("omits optional fields when absent rather than coercing to empty strings", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.publication/site-a`,
              cid: "cid-a",
              value: { scribe: { title: "Site A", domain: "a.com" } },
            },
          ],
        },
      }),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callLoader();
    expect(result.sites[0]).toEqual(
      expect.objectContaining({
        description: undefined,
        splashImageUrl: undefined,
        logoImageUrl: undefined,
        groupCount: 0,
        articleCount: 0,
      }),
    );
  });
});

describe("action — createSite", () => {
  it("rejects a missing title", async () => {
    await expect(
      callAction({ _intent: "createSite", title: "", url: "example.com" }),
    ).resolves.toEqual({ ok: false, error: "Title is required." });
  });

  it("rejects a missing domain", async () => {
    await expect(
      callAction({ _intent: "createSite", title: "My Site", url: "" }),
    ).resolves.toEqual({ ok: false, error: "Domain is required." });
  });

  it("rejects an invalid domain", async () => {
    await expect(
      callAction({
        _intent: "createSite",
        title: "My Site",
        url: "not a domain",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Domain must be a valid hostname (e.g. myblog.com).",
    });
  });

  it("creates the record without an explicit rkey (PDS generates a TID) with full scribe shape on success", async () => {
    const createRecord = vi.fn().mockResolvedValue({
      data: { uri: `at://${DID}/site.standard.publication/3jxtctq7kqm2y`, cid: "cid-a" },
    });
    vi.mocked(getAtpAgent).mockResolvedValue(makeAgent({ createRecord }));

    await expect(
      callAction({
        _intent: "createSite",
        title: "My Site",
        url: "my.example.com",
        urlPrefix: "blog",
        description: "A description",
        splashImageUrl: "https://x.com/s.png",
        showInDiscover: "on",
      }),
    ).resolves.toEqual({ ok: true });

    expect(createRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.publication",
      record: {
        $type: "site.standard.publication",
        url: "https://my.example.com",
        name: "My Site",
        preferences: { showInDiscover: true },
        scribe: {
          domain: "my.example.com",
          basePath: "blog",
          title: "My Site",
          description: "A description",
          splashImageUrl: "https://x.com/s.png",
          contributors: [],
          groups: [],
          ungroupedArticles: [],
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      },
    });
  });

  it("uploads the logo as a blob and sets the top-level icon field when a logoImageUrl is provided", async () => {
    const createRecord = vi.fn().mockResolvedValue({
      data: { uri: `at://${DID}/site.standard.publication/3jxtctq7kqm2y`, cid: "cid-a" },
    });
    const blob = { $type: "blob", ref: "bafkfake", mimeType: "image/webp", size: 123 };
    const uploadBlob = vi.fn().mockResolvedValue({ data: { blob } });
    vi.mocked(getAtpAgent).mockResolvedValue(
      makeAgent({ createRecord, uploadBlob }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/webp" }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    );

    await expect(
      callAction({
        _intent: "createSite",
        title: "My Site",
        url: "my.example.com",
        logoImageUrl: "https://x.com/l.png",
      }),
    ).resolves.toEqual({ ok: true });

    expect(uploadBlob).toHaveBeenCalled();
    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          icon: blob,
          scribe: expect.objectContaining({
            logoImageUrl: "https://x.com/l.png",
            logoImageBlob: blob,
          }),
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("returns iconWarning and omits the icon field when the blob upload fails", async () => {
    const createRecord = vi.fn().mockResolvedValue({
      data: { uri: `at://${DID}/site.standard.publication/3jxtctq7kqm2y`, cid: "cid-a" },
    });
    vi.mocked(getAtpAgent).mockResolvedValue(makeAgent({ createRecord }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await callAction({
      _intent: "createSite",
      title: "My Site",
      url: "my.example.com",
      logoImageUrl: "https://x.com/l.png",
    });

    expect(result).toEqual({
      ok: true,
      iconWarning:
        "Icon could not be uploaded — it will be set on the next Configure save.",
    });
    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.not.objectContaining({ icon: expect.anything() }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("returns an error when the PDS call fails", async () => {
    vi.mocked(getAtpAgent).mockResolvedValue(
      makeAgent({
        createRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
      }),
    );

    const result = await callAction({
      _intent: "createSite",
      title: "My Site",
      url: "my.example.com",
    });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("Failed to create site"),
    });
  });

  it("security fix: propagates a getAtpAgent redirect instead of swallowing it as a generic error", async () => {
    const redirectToLogin = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
    vi.mocked(getAtpAgent).mockRejectedValue(redirectToLogin);

    const thrown = await callAction({
      _intent: "createSite",
      title: "My Site",
      url: "my.example.com",
    }).catch((err) => err);

    expect(thrown).toBe(redirectToLogin);
  });
});

describe("action — deleteSite", () => {
  it("rejects a missing rkey", async () => {
    await expect(
      callAction({ _intent: "deleteSite", rkey: "" }),
    ).resolves.toEqual({ ok: false, error: "Missing site ID." });
  });

  it("deletes the record with the provided cid as swapRecord", async () => {
    const deleteRecord = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(getAtpAgent).mockResolvedValue(makeAgent({ deleteRecord }));

    await expect(
      callAction({ _intent: "deleteSite", rkey: "my-site", cid: "the-cid" }),
    ).resolves.toEqual({ ok: true });

    expect(deleteRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.publication",
      rkey: "my-site",
      swapRecord: "the-cid",
    });
  });

  it("returns an error when the PDS call fails", async () => {
    vi.mocked(getAtpAgent).mockResolvedValue(
      makeAgent({
        deleteRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
      }),
    );

    const result = await callAction({ _intent: "deleteSite", rkey: "my-site" });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("Failed to delete site"),
    });
  });

  it("security fix: propagates a getAtpAgent redirect instead of swallowing it as a generic error", async () => {
    const redirectToLogin = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
    vi.mocked(getAtpAgent).mockRejectedValue(redirectToLogin);

    const thrown = await callAction({
      _intent: "deleteSite",
      rkey: "my-site",
    }).catch((err) => err);

    expect(thrown).toBe(redirectToLogin);
  });
});

describe("action — unknown intent", () => {
  it("returns a generic error", async () => {
    await expect(callAction({ _intent: "bogus" })).resolves.toEqual({
      ok: false,
      error: "Unknown action.",
    });
  });
});
