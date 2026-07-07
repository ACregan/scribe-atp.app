import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@atproto/api";
import {
  computeDocumentPathUpdates,
  createGroup,
  deleteGroup,
  publishArticleToGroup,
  saveSiteOrder,
} from "./siteManifest.server";

// Deep edge-case suite for siteManifest.server.ts — the long-term primary
// suite for this module. Covers cases awkward to trigger through the full
// action/Request harness in site-list.action.real.test.ts (which is trimmed
// to dispatch-only smoke tests once this suite lands).

const DID = "did:plc:testuser";
const SITE_SLUG = "my-site";

function makeAgent(
  overrides: {
    getRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
    listRecords?: ReturnType<typeof vi.fn>;
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
    uploadBlob: vi.fn(),
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

describe("computeDocumentPathUpdates", () => {
  const domain = "example.com";

  it("returns a candidate for an article moved into a different named group", () => {
    const uri = `at://${DID}/site.standard.document/a1`;
    const oldGroupByUri = new Map([[uri, "old-group"]]);
    const groups = [
      {
        slug: "new-group",
        title: "New",
        articles: [{ uri, title: "A", slug: "a1" } as never],
      },
    ];

    const updates = computeDocumentPathUpdates(
      oldGroupByUri,
      groups,
      [],
      domain,
      "",
    );

    expect(updates).toEqual([
      {
        rkey: "a1",
        newPath: "/new-group/a1",
        newCanonicalUrl: "https://example.com/new-group/a1",
        needsPublishedAt: false,
      },
    ]);
  });

  it("returns needsPublishedAt: true when an article moves from ungrouped into a named group", () => {
    const uri = `at://${DID}/site.standard.document/a1`;
    // Article was not in any group before (not in oldGroupByUri)
    const groups = [
      {
        slug: "new-group",
        title: "New",
        articles: [{ uri, title: "A", slug: "a1" } as never],
      },
    ];

    const updates = computeDocumentPathUpdates(new Map(), groups, [], domain, "");

    expect(updates).toEqual([
      {
        rkey: "a1",
        newPath: "/new-group/a1",
        newCanonicalUrl: "https://example.com/new-group/a1",
        needsPublishedAt: true,
      },
    ]);
  });

  it("returns no candidate when an article stays in the same group", () => {
    const uri = `at://${DID}/site.standard.document/a1`;
    const oldGroupByUri = new Map([[uri, "same-group"]]);
    const groups = [
      {
        slug: "same-group",
        title: "Same",
        articles: [{ uri, title: "A", slug: "a1" } as never],
      },
    ];

    expect(
      computeDocumentPathUpdates(oldGroupByUri, groups, [], domain, ""),
    ).toEqual([]);
  });

  it("returns a candidate for an article moved from a group into ungroupedArticles", () => {
    const uri = `at://${DID}/site.standard.document/a1`;
    const oldGroupByUri = new Map([[uri, "old-group"]]);
    const ungroupedArticles = [{ uri, title: "A", slug: "a1" } as never];

    const updates = computeDocumentPathUpdates(
      oldGroupByUri,
      [],
      ungroupedArticles,
      domain,
      "",
    );

    expect(updates).toEqual([
      { rkey: "a1", newPath: "/a1", newCanonicalUrl: "https://example.com/a1", needsPublishedAt: false },
    ]);
  });

  it("returns no candidate for an article that was already ungrouped and stays ungrouped", () => {
    const uri = `at://${DID}/site.standard.document/a1`;
    const ungroupedArticles = [{ uri, title: "A", slug: "a1" } as never];

    // oldGroupByUri has no entry for uri, since it wasn't in a named group before
    expect(
      computeDocumentPathUpdates(new Map(), [], ungroupedArticles, domain, ""),
    ).toEqual([]);
  });

  it("ignores non-document URIs (e.g. legacy/other-collection refs)", () => {
    const uri = `at://${DID}/some.other.collection/a1`;
    const oldGroupByUri = new Map([[uri, "old-group"]]);
    const groups = [
      {
        slug: "new-group",
        title: "New",
        articles: [{ uri, title: "A", slug: "a1" } as never],
      },
    ];

    expect(
      computeDocumentPathUpdates(oldGroupByUri, groups, [], domain, ""),
    ).toEqual([]);
  });

  it("includes basePath in both newPath and the canonical URL when set", () => {
    // Regression test for the 2026-07-07 incident: newPath previously omitted
    // basePath even though newCanonicalUrl included it (computed separately),
    // so this exact assertion on newPath would have failed before the fix —
    // the old test only checked newCanonicalUrl and passed either way.
    const uri = `at://${DID}/site.standard.document/a1`;
    const oldGroupByUri = new Map([[uri, "old-group"]]);
    const groups = [
      {
        slug: "new-group",
        title: "New",
        articles: [{ uri, title: "A", slug: "a1" } as never],
      },
    ];

    const updates = computeDocumentPathUpdates(
      oldGroupByUri,
      groups,
      [],
      domain,
      "blog",
    );
    expect(updates[0].newPath).toBe("/blog/new-group/a1");
    expect(updates[0].newCanonicalUrl).toBe("https://example.com/blog/new-group/a1");
    expect(updates[0].needsPublishedAt).toBe(false);
  });

  it("reproduces the reported bug scenario exactly (basePath=blog, group=creative-writing)", () => {
    const uri = `at://${DID}/site.standard.document/3mp47vunfy42h`;
    const groups = [
      {
        slug: "creative-writing",
        title: "Creative Writing",
        articles: [
          {
            uri,
            title: "The Crows Of Shenton Way.",
            slug: "the-crows-of-shenton-way",
          } as never,
        ],
      },
    ];

    const updates = computeDocumentPathUpdates(
      new Map(),
      groups,
      [],
      "anthonycregan.co.uk",
      "blog",
    );

    expect(updates[0].newPath).toBe(
      "/blog/creative-writing/the-crows-of-shenton-way",
    );
    expect(updates[0].newCanonicalUrl).toBe(
      "https://anthonycregan.co.uk/blog/creative-writing/the-crows-of-shenton-way",
    );
  });

  it("leaves ungrouped (draft) moves basePath-less — no live route to protect", () => {
    const uri = `at://${DID}/site.standard.document/a1`;
    const oldGroupByUri = new Map([[uri, "old-group"]]);
    const ungroupedArticles = [{ uri, title: "A", slug: "a1" } as never];

    const updates = computeDocumentPathUpdates(
      oldGroupByUri,
      [],
      ungroupedArticles,
      domain,
      "blog",
    );

    expect(updates[0].newPath).toBe("/a1");
    expect(updates[0].newCanonicalUrl).toBe("https://example.com/a1");
  });

  it("combines group-move and ungrouped-move candidates in one pass", () => {
    const uriA = `at://${DID}/site.standard.document/a1`;
    const uriB = `at://${DID}/site.standard.document/b1`;
    const oldGroupByUri = new Map([
      [uriA, "old-group"],
      [uriB, "old-group"],
    ]);
    const groups = [
      {
        slug: "new-group",
        title: "New",
        articles: [{ uri: uriA, title: "A", slug: "a1" } as never],
      },
    ];
    const ungroupedArticles = [{ uri: uriB, title: "B", slug: "b1" } as never];

    const updates = computeDocumentPathUpdates(
      oldGroupByUri,
      groups,
      ungroupedArticles,
      domain,
      "",
    );
    expect(updates).toHaveLength(2);
    expect(updates).toEqual(
      expect.arrayContaining([
        {
          rkey: "a1",
          newPath: "/new-group/a1",
          newCanonicalUrl: "https://example.com/new-group/a1",
          needsPublishedAt: false,
        },
        {
          rkey: "b1",
          newPath: "/b1",
          newCanonicalUrl: "https://example.com/b1",
          needsPublishedAt: false,
        },
      ]),
    );
  });
});

describe("createGroup — concurrent-edit CID mismatch", () => {
  it("surfaces a swapRecord conflict as a caught error, not an uncaught throw", async () => {
    const putRecord = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("InvalidSwap"), { status: 409 }),
      );
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(siteRecord({ groups: [] })),
      putRecord,
    });

    const result = await createGroup(agent, DID, SITE_SLUG, {
      title: "Engineering",
      slug: "engineering",
    });

    expect(result).toEqual({
      error: expect.stringContaining("Failed to create group"),
    });
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({ swapRecord: "site-cid" }),
    );
  });
});

describe("deleteGroup — concurrent-edit CID mismatch", () => {
  it("surfaces a swapRecord conflict as a caught error", async () => {
    const putRecord = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("InvalidSwap"), { status: 409 }),
      );
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue(
          siteRecord({ groups: [{ slug: "g1", title: "G1", articles: [] }] }),
        ),
      putRecord,
    });

    const result = await deleteGroup(agent, DID, SITE_SLUG, "g1");

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("Failed to delete group"),
    });
  });
});

describe("publishArticleToGroup — secondary-site partial failure", () => {
  const articleUri = `at://${DID}/site.standard.document/a1`;

  it("reports a warning but still succeeds when some secondary-site ref updates fail", async () => {
    let siteGetCallCount = 0;
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection, rkey }) => {
        if (collection === "site.standard.document") {
          return Promise.resolve(docRecord("a1", { path: "/a1", title: "A" }));
        }
        // First call is the current site (siteSlug); subsequent calls are the
        // "other" sites found via listRecords/findSitesContaining.
        siteGetCallCount++;
        return Promise.resolve(
          siteRecord({
            domain: "example.com",
            basePath: "",
            title: "My Site",
            groups: [{ slug: "g1", title: "G1", articles: [] }],
            ungroupedArticles: [{ uri: articleUri, title: "A", slug: "a1" }],
          }),
        );
      }),
      putRecord: vi.fn().mockImplementation(({ collection, rkey }) => {
        // Fail the second site's manifest write (simulating a CID race)
        if (collection === "site.standard.publication" && rkey === "site-b") {
          return Promise.reject(new Error("InvalidSwap"));
        }
        return Promise.resolve({ data: { cid: "new-cid" } });
      }),
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.publication/${SITE_SLUG}`,
              value: {
                scribe: {
                  ungroupedArticles: [{ uri: articleUri }],
                  groups: [],
                },
              },
            },
            {
              uri: `at://${DID}/site.standard.publication/site-a`,
              value: {
                scribe: {
                  ungroupedArticles: [{ uri: articleUri }],
                  groups: [],
                },
              },
            },
            {
              uri: `at://${DID}/site.standard.publication/site-b`,
              value: {
                scribe: {
                  ungroupedArticles: [{ uri: articleUri }],
                  groups: [],
                },
              },
            },
          ],
        },
      }),
    });

    const result = await publishArticleToGroup(agent, DID, SITE_SLUG, {
      uri: articleUri,
      groupSlug: "g1",
      canonicalSiteRkey: SITE_SLUG,
      siteAssignments: [],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        warning:
          "Article published, but 1 linked site(s) could not be updated.",
      }),
    );
  });

  it("does not report a warning when all secondary-site ref updates succeed", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.document") {
          return Promise.resolve(docRecord("a1", { path: "/a1", title: "A" }));
        }
        return Promise.resolve(
          siteRecord({
            domain: "example.com",
            basePath: "",
            title: "My Site",
            groups: [{ slug: "g1", title: "G1", articles: [] }],
            ungroupedArticles: [{ uri: articleUri, title: "A", slug: "a1" }],
          }),
        );
      }),
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.publication/${SITE_SLUG}`,
              value: {
                scribe: {
                  ungroupedArticles: [{ uri: articleUri }],
                  groups: [],
                },
              },
            },
          ],
        },
      }),
    });

    const result = await publishArticleToGroup(agent, DID, SITE_SLUG, {
      uri: articleUri,
      groupSlug: "g1",
      canonicalSiteRkey: SITE_SLUG,
      siteAssignments: [],
    });

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("warning");
  });
});

describe("publishArticleToGroup — path/canonicalUrl with a non-empty basePath", () => {
  const articleUri = `at://${DID}/site.standard.document/a1`;

  it("includes basePath in the written path, not just canonicalUrl", async () => {
    // Regression test for the 2026-07-07 incident: this call site built
    // docPath without basePath even though canonicalUrl included it.
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.document") {
          return Promise.resolve(
            docRecord("a1", { path: "/a1", title: "A", scribe: {} }),
          );
        }
        return Promise.resolve(
          siteRecord({
            domain: "example.com",
            basePath: "blog",
            title: "My Site",
            groups: [{ slug: "creative-writing", title: "Creative Writing", articles: [] }],
            ungroupedArticles: [{ uri: articleUri, title: "A", slug: "a1" }],
          }),
        );
      }),
      putRecord,
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.publication/${SITE_SLUG}`,
              value: {
                scribe: { ungroupedArticles: [{ uri: articleUri }], groups: [] },
              },
            },
          ],
        },
      }),
    });

    const result = await publishArticleToGroup(agent, DID, SITE_SLUG, {
      uri: articleUri,
      groupSlug: "creative-writing",
      canonicalSiteRkey: SITE_SLUG,
      siteAssignments: [],
    });

    expect(result.ok).toBe(true);
    const documentPutCall = putRecord.mock.calls.find(
      ([args]) => args.collection === "site.standard.document",
    )!;
    expect(documentPutCall[0].record.path).toBe("/blog/creative-writing/a1");
    expect(documentPutCall[0].record.scribe.canonicalUrl).toBe(
      "https://example.com/blog/creative-writing/a1",
    );
  });
});

describe("saveSiteOrder — cross-posted article canonical-site guard", () => {
  // Regression coverage for the 2026-07-07 incident: a document cross-posted
  // to two sites had its canonical path/canonicalUrl silently overwritten
  // whenever the *other* (non-canonical) site's article list was reordered,
  // because saveSiteOrder had no concept of which site actually owns the
  // document's canonical URL. See [[urgent-article-path-basepath-bug]].
  const articleUri = `at://${DID}/site.standard.document/a1`;

  it("does not touch path/canonicalUrl when this site is not the document's canonical site", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.publication") {
          return Promise.resolve(
            siteRecord({
              domain: "norobots.blog",
              basePath: "",
              groups: [
                {
                  slug: "old-group",
                  title: "Old",
                  articles: [{ uri: articleUri, title: "A", slug: "a1" }],
                },
              ],
              ungroupedArticles: [],
            }),
          );
        }
        // The document's canonical site is a *different* publication.
        return Promise.resolve(
          docRecord("a1", {
            path: "/blog/creative-writing/a1",
            title: "A",
            site: `at://${DID}/site.standard.publication/canonical-site`,
            scribe: {
              canonicalUrl: "https://anthonycregan.co.uk/blog/creative-writing/a1",
            },
          }),
        );
      }),
      putRecord,
    });

    const groups = [
      {
        slug: "creative-writing",
        title: "Creative Writing",
        articles: [{ uri: articleUri, title: "A", slug: "a1" } as never],
      },
    ];

    const result = await saveSiteOrder(agent, DID, SITE_SLUG, {
      groups,
      ungroupedArticles: [],
    });

    expect(result).toEqual({ ok: true });
    const documentPutCalls = putRecord.mock.calls.filter(
      ([args]) => args.collection === "site.standard.document",
    );
    expect(documentPutCalls).toHaveLength(0);
  });

  it("does rewrite path/canonicalUrl (with basePath) when this site is the canonical site", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.publication") {
          return Promise.resolve(
            siteRecord({
              domain: "anthonycregan.co.uk",
              basePath: "blog",
              groups: [
                {
                  slug: "old-group",
                  title: "Old",
                  articles: [{ uri: articleUri, title: "A", slug: "a1" }],
                },
              ],
              ungroupedArticles: [],
            }),
          );
        }
        return Promise.resolve(
          docRecord("a1", {
            path: "/blog/old-group/a1",
            title: "A",
            site: `at://${DID}/site.standard.publication/${SITE_SLUG}`,
            scribe: {
              canonicalUrl: "https://anthonycregan.co.uk/blog/old-group/a1",
            },
          }),
        );
      }),
      putRecord,
    });

    const groups = [
      {
        slug: "creative-writing",
        title: "Creative Writing",
        articles: [{ uri: articleUri, title: "A", slug: "a1" } as never],
      },
    ];

    const result = await saveSiteOrder(agent, DID, SITE_SLUG, {
      groups,
      ungroupedArticles: [],
    });

    expect(result).toEqual({ ok: true });
    const documentPutCall = putRecord.mock.calls.find(
      ([args]) => args.collection === "site.standard.document",
    )!;
    expect(documentPutCall[0].record.path).toBe("/blog/creative-writing/a1");
    expect(documentPutCall[0].record.scribe.canonicalUrl).toBe(
      "https://anthonycregan.co.uk/blog/creative-writing/a1",
    );
  });
});
