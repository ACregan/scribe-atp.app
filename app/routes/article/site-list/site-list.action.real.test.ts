import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { action } from "./site-list";
import { requireAuth, getAtpAgent } from "~/services/auth.server";

// Characterization tests for the site-list action's real-OAuth path (useRealOAuth: true).
// Written against the untouched action before extracting its logic into
// app/services/siteManifest.server.ts — see docs/archive/improve-codebase-architecture-reports
// and the approved plan for context. Dev-bypass path is covered separately in
// site-list.action.devBypass.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

const DID = "did:plc:testuser";
const SITE_SLUG = "my-site";

function makeRequest(entries: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/list/my-site", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest(entries),
    params: { siteSlug: SITE_SLUG },
  } as unknown as Parameters<typeof action>[0]);
}

type AgentOverrides = {
  getRecord?: ReturnType<typeof vi.fn>;
  putRecord?: ReturnType<typeof vi.fn>;
  listRecords?: ReturnType<typeof vi.fn>;
  createRecord?: ReturnType<typeof vi.fn>;
  uploadBlob?: ReturnType<typeof vi.fn>;
};

function makeAgent(overrides: AgentOverrides = {}) {
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
          createRecord: overrides.createRecord ?? vi.fn(),
        },
      },
    },
    uploadBlob: overrides.uploadBlob ?? vi.fn(),
  } as unknown as Agent;
}

function siteRecord(scribe: Record<string, unknown>) {
  return {
    data: {
      cid: "site-cid",
      value: { $type: "site.standard.publication", scribe },
    },
  };
}

function docRecord(rkey: string, value: Record<string, unknown>) {
  return { data: { cid: `${rkey}-cid`, value } };
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockReset();
});

describe("action — createGroup", () => {
  it("rejects a missing title", async () => {
    await expect(
      callAction({ _intent: "createGroup", title: "" }),
    ).resolves.toEqual({
      error: "Group title is required.",
    });
  });

  it("rejects a title with no alphanumeric characters and no slug override", async () => {
    await expect(
      callAction({ _intent: "createGroup", title: "!!!" }),
    ).resolves.toEqual({
      error: "Title must contain at least one letter or number.",
    });
  });

  it("rejects an invalid slug override", async () => {
    await expect(
      callAction({
        _intent: "createGroup",
        title: "Engineering",
        slug: "bad slug!",
      }),
    ).resolves.toEqual({
      error: "URL path must be lowercase letters, numbers and hyphens only.",
    });
  });

  it("rejects a duplicate group slug", async () => {
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecord({
            groups: [
              { slug: "engineering", title: "Engineering", articles: [] },
            ],
          }),
        ),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    await expect(
      callAction({ _intent: "createGroup", title: "Engineering" }),
    ).resolves.toEqual({ error: "A group with this name already exists." });
  });

  it("appends the new group and writes the record on success", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(siteRecord({ groups: [] })),
      putRecord,
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    await expect(
      callAction({ _intent: "createGroup", title: "Engineering" }),
    ).resolves.toEqual({ ok: true });

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            groups: [
              { slug: "engineering", title: "Engineering", articles: [] },
            ],
          }),
        }),
        swapRecord: "site-cid",
      }),
    );
  });

  it("bug fix: returns an error instead of throwing when the PDS getRecord call fails", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("PDS unavailable")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      _intent: "createGroup",
      title: "Engineering",
    });
    expect(result).toEqual({
      error: expect.stringContaining("Failed to create group"),
    });
  });
});

describe("action — deleteGroup", () => {
  it("rejects a missing group slug", async () => {
    await expect(
      callAction({ _intent: "deleteGroup", rkey: "" }),
    ).resolves.toEqual({
      ok: false,
      error: "Missing group ID.",
    });
  });

  it("removes the group and writes the record on success", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({
          groups: [
            { slug: "engineering", title: "Engineering", articles: [] },
            { slug: "design", title: "Design", articles: [] },
          ],
        }),
      ),
      putRecord,
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    await expect(
      callAction({ _intent: "deleteGroup", rkey: "engineering" }),
    ).resolves.toEqual({ ok: true, deletedSlug: "engineering" });

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            groups: [{ slug: "design", title: "Design", articles: [] }],
          }),
        }),
      }),
    );
  });

  it("returns an error when the PDS call fails", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("PDS unavailable")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      _intent: "deleteGroup",
      rkey: "engineering",
    });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("Failed to delete group"),
    });
  });
});

describe("action — saveSite", () => {
  it("rejects missing site data", async () => {
    await expect(callAction({ _intent: "saveSite" })).resolves.toEqual({
      error: "No data.",
    });
  });

  it("saves the new group/article order and updates a moved published article's path", async () => {
    const articleUri = `at://${DID}/site.standard.document/article1`;
    const currentScribe = {
      domain: "example.com",
      basePath: "",
      groups: [
        {
          slug: "old-group",
          title: "Old",
          articles: [{ uri: articleUri, title: "A", slug: "article1" }],
        },
      ],
      ungroupedArticles: [],
    };
    const newGroups = [
      { slug: "old-group", title: "Old", articles: [] },
      {
        slug: "new-group",
        title: "New",
        articles: [{ uri: articleUri, title: "A", slug: "article1" }],
      },
    ];

    const sitePutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "new-cid" } });
    const docPutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "doc-new-cid" } });
    const getRecord = vi.fn().mockImplementation(({ collection, rkey }) => {
      if (collection === "site.standard.publication")
        return Promise.resolve(siteRecord(currentScribe));
      if (collection === "site.standard.document") {
        return Promise.resolve(
          docRecord(rkey, { path: "/old-group/article1", title: "A" }),
        );
      }
      throw new Error(`unexpected collection ${collection}`);
    });
    const agent = makeAgent({
      getRecord,
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? sitePutRecord(args)
            : docPutRecord(args),
        ),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      _intent: "saveSite",
      siteData: JSON.stringify({ groups: newGroups, ungroupedArticles: [] }),
    });

    expect(result).toEqual({ ok: true });
    expect(sitePutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            groups: newGroups,
            ungroupedArticles: [],
          }),
        }),
      }),
    );
    expect(docPutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        rkey: "article1",
        record: expect.objectContaining({
          path: "/new-group/article1",
          scribe: expect.objectContaining({
            canonicalUrl: "https://example.com/new-group/article1",
          }),
        }),
      }),
    );
  });

  it("reports the count of article path updates that fail", async () => {
    const articleUri = `at://${DID}/site.standard.document/article1`;
    const currentScribe = {
      domain: "example.com",
      basePath: "",
      groups: [
        {
          slug: "old-group",
          title: "Old",
          articles: [{ uri: articleUri, title: "A", slug: "article1" }],
        },
      ],
      ungroupedArticles: [],
    };
    const newGroups = [
      { slug: "old-group", title: "Old", articles: [] },
      {
        slug: "new-group",
        title: "New",
        articles: [{ uri: articleUri, title: "A", slug: "article1" }],
      },
    ];
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.publication")
          return Promise.resolve(siteRecord(currentScribe));
        return Promise.reject(new Error("document fetch failed"));
      }),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      _intent: "saveSite",
      siteData: JSON.stringify({ groups: newGroups, ungroupedArticles: [] }),
    });

    expect(result).toEqual({ error: "1 article path(s) failed to update." });
  });

  it("returns an error when the initial getRecord fails", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      _intent: "saveSite",
      siteData: JSON.stringify({ groups: [], ungroupedArticles: [] }),
    });
    expect(result).toEqual({
      error: expect.stringContaining("Failed to save order"),
    });
  });
});

describe("action — removeArticle", () => {
  const articleUri = `at://${DID}/site.standard.document/article1`;

  it("redirects immediately when uri is missing", async () => {
    const response = (await callAction({
      _intent: "removeArticle",
      uri: "",
    })) as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
  });

  it("removes the article ref and redirects", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({
          groups: [
            {
              slug: "g1",
              title: "G1",
              articles: [{ uri: articleUri, title: "A" }],
            },
          ],
          ungroupedArticles: [],
        }),
      ),
      putRecord,
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const response = (await callAction({
      _intent: "removeArticle",
      uri: articleUri,
    })) as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            groups: [{ slug: "g1", title: "G1", articles: [] }],
          }),
        }),
      }),
    );
  });

  it("still redirects when the PDS call fails (errors are swallowed)", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const response = (await callAction({
      _intent: "removeArticle",
      uri: articleUri,
    })) as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
  });
});

describe("action — moveToDraft", () => {
  const articleUri = `at://${DID}/site.standard.document/article1`;

  it("redirects immediately when uri is missing", async () => {
    const response = (await callAction({
      _intent: "moveToDraft",
      uri: "",
    })) as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Location")).toBe(`/article/list/${SITE_SLUG}`);
  });

  it("moves the ref from its group to ungroupedArticles and resets the document path", async () => {
    const sitePutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "new-cid" } });
    const docPutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "doc-new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.document") {
          return Promise.resolve(
            docRecord("article1", {
              path: "/g1/article1",
              title: "A",
              publishedAt: "2026-01-01T00:00:00Z",
              scribe: { canonicalUrl: "https://example.com/g1/article1" },
            }),
          );
        }
        return Promise.resolve(
          siteRecord({
            groups: [
              {
                slug: "g1",
                title: "G1",
                articles: [{ uri: articleUri, title: "A", slug: "article1" }],
              },
            ],
            ungroupedArticles: [],
          }),
        );
      }),
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? sitePutRecord(args)
            : docPutRecord(args),
        ),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const response = (await callAction({
      _intent: "moveToDraft",
      uri: articleUri,
    })) as Response;
    expect(response).toBeInstanceOf(Response);

    expect(sitePutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            groups: [{ slug: "g1", title: "G1", articles: [] }],
            ungroupedArticles: [
              expect.objectContaining({
                uri: articleUri,
                title: "A",
                slug: "article1",
              }),
            ],
          }),
        }),
      }),
    );
    expect(docPutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ path: "/article1" }),
      }),
    );
    const writtenDoc = docPutRecord.mock.calls[0][0].record;
    expect(writtenDoc.publishedAt).toBeUndefined();
    expect(writtenDoc.scribe.canonicalUrl).toBeUndefined();
  });

  it("bug fix: does not duplicate the ArticleRef when the article is already in ungroupedArticles", async () => {
    const existingRef = {
      uri: articleUri,
      title: "A",
      slug: "article1",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const sitePutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.document") {
          return Promise.resolve(
            docRecord("article1", { path: "/article1", title: "A" }),
          );
        }
        return Promise.resolve(
          siteRecord({ groups: [], ungroupedArticles: [existingRef] }),
        );
      }),
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? sitePutRecord(args)
            : Promise.resolve({ data: { cid: "doc-new-cid" } }),
        ),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    await callAction({ _intent: "moveToDraft", uri: articleUri });

    const writtenScribe = sitePutRecord.mock.calls[0][0].record.scribe;
    expect(writtenScribe.ungroupedArticles).toHaveLength(1);
  });

  it("still redirects when the PDS call fails (errors are swallowed)", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const response = (await callAction({
      _intent: "moveToDraft",
      uri: articleUri,
    })) as Response;
    expect(response).toBeInstanceOf(Response);
  });
});

describe("action — publishArticle", () => {
  const articleUri = `at://${DID}/site.standard.document/article1`;

  it("returns ok:false when uri or groupSlug is missing", async () => {
    await expect(
      callAction({ _intent: "publishArticle", uri: "", groupSlug: "g1" }),
    ).resolves.toEqual({ ok: false });
  });

  it("bug fix: degrades to ok:false instead of throwing on malformed siteAssignments", async () => {
    const result = await callAction({
      _intent: "publishArticle",
      uri: articleUri,
      groupSlug: "g1",
      siteAssignments: "not valid json",
    });
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  it("publishes the article: writes the document and moves the ref into the target group", async () => {
    const docPutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "doc-new-cid" } });
    const sitePutRecord = vi
      .fn()
      .mockResolvedValue({ data: { cid: "site-new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.document") {
          return Promise.resolve(
            docRecord("article1", { path: "/article1", title: "A" }),
          );
        }
        return Promise.resolve(
          siteRecord({
            domain: "example.com",
            basePath: "",
            title: "My Site",
            groups: [{ slug: "g1", title: "G1", articles: [] }],
            ungroupedArticles: [
              { uri: articleUri, title: "A", slug: "article1" },
            ],
          }),
        );
      }),
      putRecord: vi
        .fn()
        .mockImplementation((args) =>
          args.collection === "site.standard.publication"
            ? sitePutRecord(args)
            : docPutRecord(args),
        ),
      listRecords: vi.fn().mockResolvedValue({ data: { records: [] } }),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      _intent: "publishArticle",
      uri: articleUri,
      groupSlug: "g1",
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: true, uri: articleUri, groupSlug: "g1" }),
    );
    expect(docPutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          path: "/g1/article1",
          publishedAt: expect.any(String),
        }),
      }),
    );
    expect(sitePutRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            ungroupedArticles: [],
            groups: [
              expect.objectContaining({
                slug: "g1",
                articles: expect.arrayContaining([
                  expect.objectContaining({ uri: articleUri }),
                ]),
              }),
            ],
          }),
        }),
      }),
    );
  });

  it("bug fix: returns an error message when the publish write fails", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(getAtpAgent).mockResolvedValue(agent);

    const result = await callAction({
      _intent: "publishArticle",
      uri: articleUri,
      groupSlug: "g1",
    });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});
