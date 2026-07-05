import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./edit";
import { requireAtpAgent } from "~/services/auth.server";

// Characterization tests for the edit-article route's real-OAuth path
// (useRealOAuth: true), written before extracting its document reads/writes
// onto app/services/documentRepository.server.ts. Dev-bypass path is covered
// in edit.devBypass.test.ts.
//
// One test below deliberately characterizes (does NOT fix) a pre-existing
// bug: the action calls computeSiteAssignmentChanges(oldSiteRkeys, oldSiteRkeys)
// — the same value for both "old" and "new" — because no `sites` field is ever
// read from the submitted form data. This means sitesToAdd/sitesToRemove are
// always empty and the edit page's site multi-select cannot actually change
// which sites an article belongs to. Fixing this needs a frontend change
// (submitting the selected sites) as well as a backend one, which is out of
// scope for this repository-seam extraction — flagged for its own ticket.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DID = "did:plc:testuser";

function makeAgent(
  overrides: {
    getRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
    listRecords?: ReturnType<typeof vi.fn>;
    uploadBlob?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord: overrides.getRecord ?? vi.fn(),
          putRecord:
            overrides.putRecord ??
            vi.fn().mockResolvedValue({ data: { cid: "new-cid" } }),
          listRecords:
            overrides.listRecords ??
            vi.fn().mockResolvedValue({ data: { records: [] } }),
        },
      },
    },
    uploadBlob: overrides.uploadBlob ?? vi.fn(),
  } as unknown as Agent;
}

function docListRecord(
  rkey: string,
  value: Record<string, unknown>,
  cid = `${rkey}-cid`,
) {
  return { uri: `at://${DID}/site.standard.document/${rkey}`, cid, value };
}

function siteListRecord(rkey: string, scribe: Record<string, unknown>) {
  return {
    uri: `at://${DID}/site.standard.publication/${rkey}`,
    cid: `${rkey}-cid`,
    value: { scribe },
  };
}

function listRecordsByCollection(
  documentPages: Array<{ records: unknown[]; cursor?: string }>,
  siteRecords: unknown[] = [],
) {
  let docCallIndex = 0;
  return vi.fn().mockImplementation(({ collection }) => {
    if (collection === "site.standard.publication") {
      return Promise.resolve({ data: { records: siteRecords } });
    }
    const page = documentPages[docCallIndex] ?? { records: [] };
    docCallIndex++;
    return Promise.resolve({ data: page });
  });
}

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/article/edit/my-article");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/edit/my-article", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest(entries),
  } as unknown as Parameters<typeof action>[0]);
}

function callLoader(articleUrl = "my-article") {
  return loader({
    request: makeRequest(),
    params: { articleUrl },
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockReset();
});

describe("loader", () => {
  it("finds the document by slug across paginated listRecords results and maps it to the form shape", async () => {
    const listRecords = listRecordsByCollection(
      [
        {
          records: [docListRecord("page1doc", { path: "/page1doc" })],
          cursor: "page2",
        },
        {
          records: [
            docListRecord("my-article", {
              title: "My Article",
              path: "/my-article",
              content: { $type: "app.scribe.content.html", html: "<p>Hi</p>" },
              description: "A description",
              tags: ["a", "b"],
              site: "https://example.com",
              publishedAt: "2026-01-01T00:00:00Z",
              scribe: {
                coverImageUrl: "https://x.com/s.png",
                createdAt: "2025-12-01T00:00:00Z",
              },
            }),
          ],
          cursor: undefined,
        },
      ],
      [siteListRecord("site-a", { title: "Site A", domain: "a.com" })],
    );
    const agent = makeAgent({ listRecords });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callLoader("my-article");

    expect(result).toEqual({
      rkey: "my-article",
      title: "My Article",
      content: "<p>Hi</p>",
      slug: "my-article",
      splashImageUrl: "https://x.com/s.png",
      description: "A description",
      tags: ["a", "b"],
      createdAt: "2025-12-01T00:00:00Z",
      cid: "my-article-cid",
      sites: [{ rkey: "site-a", title: "Site A", url: "a.com" }],
      currentSiteRkeys: [],
      publishedSite: "https://example.com",
      publishedAt: "2026-01-01T00:00:00Z",
      publishedPath: "/my-article",
    });
    expect(listRecords).toHaveBeenCalledTimes(4); // 2 document pages + loadSiteOptions + findSitesContaining
  });

  it("throws a 404 Response when no document matches the slug", async () => {
    const listRecords = listRecordsByCollection([{ records: [] }]);
    const agent = makeAgent({ listRecords });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const thrown = await callLoader("missing-slug").catch((err) => err);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  it("extracts a plain string content field when it isn't wrapped in the app.scribe.content.html object", async () => {
    const listRecords = listRecordsByCollection([
      {
        records: [
          docListRecord("my-article", {
            path: "/my-article",
            content: "raw string content",
          }),
        ],
      },
    ]);
    const agent = makeAgent({ listRecords });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callLoader("my-article");
    expect(result.content).toBe("raw string content");
  });

  it("falls back through splashImageUrl sources: scribe.splashImageUrl, then value.splashImageUrl, then empty string", async () => {
    const listRecordsA = listRecordsByCollection([
      {
        records: [
          docListRecord("my-article", {
            path: "/my-article",
            scribe: { splashImageUrl: "https://x.com/scribe-splash.png" },
          }),
        ],
      },
    ]);
    const agentA = makeAgent({ listRecords: listRecordsA });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: agentA,
      did: DID,
      handle: DID,
    });
    expect((await callLoader("my-article")).splashImageUrl).toBe(
      "https://x.com/scribe-splash.png",
    );

    const listRecordsB = listRecordsByCollection([
      {
        records: [
          docListRecord("my-article", {
            path: "/my-article",
            splashImageUrl: "https://x.com/toplevel-splash.png",
          }),
        ],
      },
    ]);
    const agentB = makeAgent({ listRecords: listRecordsB });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: agentB,
      did: DID,
      handle: DID,
    });
    expect((await callLoader("my-article")).splashImageUrl).toBe(
      "https://x.com/toplevel-splash.png",
    );

    const listRecordsC = listRecordsByCollection([
      { records: [docListRecord("my-article", { path: "/my-article" })] },
    ]);
    const agentC = makeAgent({ listRecords: listRecordsC });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: agentC,
      did: DID,
      handle: DID,
    });
    expect((await callLoader("my-article")).splashImageUrl).toBe("");
  });
});

describe("action — validation", () => {
  it("rejects a missing title without touching the agent", async () => {
    await expect(callAction({ title: "", url: "my-article" })).resolves.toEqual(
      { ok: false, error: "Title is required." },
    );
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action — save", () => {
  function baseFields(overrides: Record<string, string> = {}) {
    return {
      title: "Updated Title",
      content: "<p>Updated content</p>",
      url: "my-article",
      rkey: "the-rkey",
      cid: "old-cid",
      createdAt: "2025-01-01T00:00:00Z",
      publishedSite: "https://example.com",
      publishedAt: "2026-01-01T00:00:00Z",
      publishedPath: "/my-article",
      oldSiteRkeys: "[]",
      ...overrides,
    };
  }

  it("always putRecords (never creates) with the fetched cid as swapRecord", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({ data: { value: {} } }),
      putRecord,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    await callAction(baseFields());

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "site.standard.document",
        rkey: "the-rkey",
        swapRecord: "old-cid",
      }),
    );
  });

  it("preserves existing contributors and bskyPostRef fetched from the current record", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({
        data: {
          value: {
            contributors: [{ did: "did:plc:other", role: "editor" }],
            bskyPostRef: {
              uri: "at://x/app.bsky.feed.post/1",
              cid: "post-cid",
            },
          },
        },
      }),
      putRecord,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    await callAction(baseFields());

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          contributors: [{ did: "did:plc:other", role: "editor" }],
          bskyPostRef: { uri: "at://x/app.bsky.feed.post/1", cid: "post-cid" },
        }),
      }),
    );
  });

  it("proceeds without existing data when the pre-fetch getRecord fails (non-fatal)", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("not found")),
      putRecord,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callAction(baseFields());
    expect(result).toEqual(
      expect.objectContaining({ ok: true, title: "Updated Title" }),
    );
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ contributors: [] }),
      }),
    );
  });

  it("returns newSlug (not newCid) and updates path/canonicalUrl when the slug changes", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({
        data: {
          value: { scribe: { canonicalUrl: "https://example.com/old-slug" } },
        },
      }),
      putRecord,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callAction(
      baseFields({ url: "new-slug", publishedPath: "/old-slug" }),
    );

    expect(result).toEqual({
      ok: true,
      title: "Updated Title",
      newSlug: "new-slug",
      coverImageWarning: undefined,
    });
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          path: "/new-slug",
          scribe: expect.objectContaining({
            canonicalUrl: "https://example.com/new-slug",
          }),
        }),
      }),
    );
  });

  it("returns newCid (not newSlug) when the slug is unchanged", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({ data: { value: {} } }),
      putRecord,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callAction(baseFields());
    expect(result).toEqual({
      ok: true,
      title: "Updated Title",
      newCid: "new-cid",
      coverImageWarning: undefined,
    });
  });

  it("reuses the cached cover image blob when the splashImageUrl is unchanged", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const uploadBlob = vi.fn();
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({
        data: {
          value: {
            coverImage: { ref: "cached-blob" },
            scribe: { coverImageUrl: "https://x.com/s.png" },
          },
        },
      }),
      putRecord,
      uploadBlob,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    await callAction(baseFields({ splashImageUrl: "https://x.com/s.png" }));

    expect(uploadBlob).not.toHaveBeenCalled();
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          coverImage: { ref: "cached-blob" },
        }),
      }),
    );
  });

  it("uploads a new cover image blob when the splashImageUrl changes", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
      headers: new Headers({ "content-type": "image/webp" }),
    }) as unknown as typeof fetch;

    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const uploadBlob = vi
      .fn()
      .mockResolvedValue({ data: { blob: { ref: "new-blob" } } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({
        data: {
          value: {
            coverImage: { ref: "old-blob" },
            scribe: { coverImageUrl: "https://x.com/old.png" },
          },
        },
      }),
      putRecord,
      uploadBlob,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    try {
      await callAction(baseFields({ splashImageUrl: "https://x.com/new.png" }));
    } finally {
      global.fetch = originalFetch;
    }

    expect(uploadBlob).toHaveBeenCalled();
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          coverImage: { ref: "new-blob" },
        }),
      }),
    );
  });

  it("sets coverImageWarning and still saves when the cover image fetch fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({ data: { value: {} } }),
      putRecord,
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    let result;
    try {
      result = await callAction(
        baseFields({ splashImageUrl: "https://x.com/new.png" }),
      );
    } finally {
      global.fetch = originalFetch;
    }

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        coverImageWarning: "Cover image could not be uploaded.",
      }),
    );
  });

  it("characterizes (does not fix) the site-reassignment bug: sitesToSync always equals oldSiteRkeys since the same value is passed as both old and new rkeys", async () => {
    const articleUri = `at://${DID}/site.standard.document/the-rkey`;
    const sitePutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "site-new-cid" } });
    const putRecord = vi
      .fn()
      .mockImplementation((args) =>
        args.collection === "site.standard.document"
          ? Promise.resolve({ data: { cid: "new-cid" } })
          : sitePutRecord(args),
      );
    const getRecord = vi.fn().mockImplementation((args) => {
      if (args.collection === "site.standard.document") {
        return Promise.resolve({ data: { value: {} } });
      }
      return Promise.resolve({
        data: {
          cid: "site-a-cid",
          value: {
            scribe: {
              ungroupedArticles: [{ uri: articleUri, title: "Old Title" }],
              groups: [],
            },
          },
        },
      });
    });
    const agent = makeAgent({ getRecord, putRecord });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    await callAction(
      baseFields({ rkey: "the-rkey", oldSiteRkeys: '["site-a"]' }),
    );

    // The site is neither added nor removed — it's only ever "synced" in
    // place, because computeSiteAssignmentChanges(oldSiteRkeys, oldSiteRkeys)
    // can never produce a diff. There is no form field carrying the user's
    // selected sites for this to compare against.
    expect(sitePutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        rkey: "site-a",
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            ungroupedArticles: [
              expect.objectContaining({
                uri: articleUri,
                title: "Updated Title",
              }),
            ],
          }),
        }),
      }),
    );
  });
});

describe("action — failure", () => {
  it("returns an error message when the PDS save fails", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue({ data: { value: {} } }),
      putRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: DID,
    });

    const result = await callAction(baseFieldsForFailureTest());
    expect(result).toEqual({ ok: false, error: "PDS down" });
  });

  function baseFieldsForFailureTest() {
    return {
      title: "Updated Title",
      content: "<p>Updated content</p>",
      url: "my-article",
      rkey: "the-rkey",
      cid: "old-cid",
      createdAt: "2025-01-01T00:00:00Z",
      publishedSite: "https://example.com",
      publishedAt: "2026-01-01T00:00:00Z",
      publishedPath: "/my-article",
      oldSiteRkeys: "[]",
    };
  }
});
