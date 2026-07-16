import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./list";
import { requireAtpAgent, requireAuth } from "~/services/auth.server";
import { db, contributorMemberships, pendingSubmissions } from "~/services/db.server";
import { fetchBskyProfile } from "~/services/blueskyProfile.server";

// Characterization tests for the article-list route's real-OAuth path
// (useRealOAuth: true), written before extracting onto
// app/services/documentRepository.server.ts and app/services/siteRepository.server.ts.
// Also encodes the two user-approved bug fixes for this route (orphaned
// ArticleRef cleanup on delete, and try/catch on the loader/action) — those
// tests assert the FIXED behavior and are expected to fail until the
// extraction+fix commit lands. Dev-bypass path is covered in
// list.devBypass.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  requireAuth: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("~/services/blueskyProfile.server", () => ({
  fetchBskyProfile: vi.fn(),
}));

const DID = "did:plc:testuser";
const HANDLE = "testuser.bsky.social";

function makeAgent(
  overrides: {
    listRecords?: ReturnType<typeof vi.fn>;
    deleteRecord?: ReturnType<typeof vi.fn>;
    getRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords:
            overrides.listRecords ??
            vi.fn().mockResolvedValue({ data: { records: [] } }),
          deleteRecord:
            overrides.deleteRecord ?? vi.fn().mockResolvedValue({ data: {} }),
          getRecord: overrides.getRecord ?? vi.fn(),
          putRecord:
            overrides.putRecord ?? vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    },
  } as unknown as Agent;
}

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/article/list");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/list", {
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
  return loader({ request: makeRequest() } as unknown as Parameters<
    typeof loader
  >[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockReset();
  vi.mocked(requireAuth).mockReset();
  vi.mocked(fetchBskyProfile).mockReset();
  db.exec("DELETE FROM pending_submissions");
  db.exec("DELETE FROM contributor_memberships");
});

// ADR 0021 point 3 — same DID-resolution + site-record fetch pattern
// contributorRoster.server.test.ts uses for listPendingInvitations/
// listContributorSites; list.tsx's loader wires directly into that code, so
// its own tests need the same fetch stub shape.
function mockFetchForSites(
  bySiteRkey: Record<string, { scribe: Record<string, unknown> } | "reject">,
) {
  return vi.fn().mockImplementation((input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("https://plc.directory/")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            service: [
              { id: "#atproto_pds", serviceEndpoint: "https://owner-pds.example" },
            ],
          }),
      });
    }
    const rkey = new URL(url).searchParams.get("rkey")!;
    const outcome = bySiteRkey[rkey];
    if (outcome === "reject" || outcome === undefined) {
      return Promise.resolve({ ok: false, status: 400, statusText: "RecordNotFound" });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: outcome }) });
  });
}

function siteListRecord(rkey: string, scribe: Record<string, unknown>) {
  return {
    uri: `at://${DID}/site.standard.publication/${rkey}`,
    cid: `${rkey}-cid`,
    value: { scribe },
  };
}

function docListRecord(
  rkey: string,
  value: Record<string, unknown>,
  cid = `${rkey}-cid`,
) {
  return { uri: `at://${DID}/site.standard.document/${rkey}`, cid, value };
}

describe("loader", () => {
  it("splits documents into published (site-assigned) vs standalone, sorted by publishedAt desc", async () => {
    const groupedUri = `at://${DID}/site.standard.document/grouped1`;
    const ungroupedUri = `at://${DID}/site.standard.document/ungrouped1`;
    const orphanUri = `at://${DID}/site.standard.document/orphan1`;

    const agent = makeAgent({
      listRecords: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.publication") {
          return Promise.resolve({
            data: {
              records: [
                siteListRecord("site-a", {
                  title: "Site A",
                  domain: "a.com",
                  basePath: "blog",
                  ungroupedArticles: [{ uri: ungroupedUri }],
                  groups: [
                    {
                      slug: "g1",
                      title: "Group 1",
                      articles: [{ uri: groupedUri }],
                    },
                  ],
                }),
              ],
            },
          });
        }
        return Promise.resolve({
          data: {
            records: [
              docListRecord("grouped1", {
                title: "Grouped",
                path: "/g1/grouped1",
                publishedAt: "2026-01-02T00:00:00Z",
              }),
              docListRecord("ungrouped1", {
                title: "Ungrouped",
                path: "/ungrouped1",
                publishedAt: "2026-01-01T00:00:00Z",
              }),
              docListRecord(
                "orphan1",
                {
                  title: "Orphan",
                  path: "/orphan1",
                  createdAt: "2026-01-03T00:00:00Z",
                },
                "orphan1-cid",
              ),
            ],
          },
        });
      }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    const result = await callLoader();

    expect(result.authorDid).toBe(DID);
    expect(result.authorHandle).toBe(HANDLE);
    expect(result.publishedArticles.map((a) => a.rkey)).toEqual([
      "grouped1",
      "ungrouped1",
    ]);
    expect(result.publishedArticles[0].assignments).toEqual([
      expect.objectContaining({
        siteRkey: "site-a",
        groupTitle: "Group 1",
        groupSlug: "g1",
      }),
    ]);
    expect(result.publishedArticles[1].assignments).toEqual([
      {
        siteTitle: "Site A",
        siteRkey: "site-a",
        siteAtUri: `at://${DID}/site.standard.publication/site-a`,
        siteUrl: "a.com",
        siteUrlPrefix: "blog",
        logoImageUrl: undefined,
        splashImageUrl: undefined,
      },
    ]);
    expect(result.standaloneArticles).toEqual([
      expect.objectContaining({
        rkey: "orphan1",
        title: "Orphan",
        cid: "orphan1-cid",
      }),
    ]);
  });

  it("bug fix: catches a PDS failure instead of throwing uncaught", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    const thrown = await callLoader().catch((err) => err);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
  });

  // ADR 0021 point 6 — the "Pending Review" pill depends on the loader
  // surfacing scribe.pendingPublish off an otherwise-loose document.
  it("surfaces scribe.pendingPublish on a standalone article", async () => {
    const siteUri = "at://did:plc:owner/site.standard.publication/site-b";
    const agent = makeAgent({
      listRecords: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.publication") {
          return Promise.resolve({ data: { records: [] } });
        }
        return Promise.resolve({
          data: {
            records: [
              docListRecord("loose1", {
                title: "Loose Article",
                path: "/loose1",
                createdAt: "2026-01-01T00:00:00Z",
                scribe: {
                  pendingPublish: {
                    siteUri,
                    submittedAt: "2026-01-02T00:00:00Z",
                  },
                },
              }),
            ],
          },
        });
      }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    const result = await callLoader();

    expect(result.standaloneArticles).toEqual([
      expect.objectContaining({
        rkey: "loose1",
        pendingPublish: { siteUri, submittedAt: "2026-01-02T00:00:00Z" },
      }),
    ]);
  });

  it("omits pendingPublish when scribe.pendingPublish isn't set", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.publication") {
          return Promise.resolve({ data: { records: [] } });
        }
        return Promise.resolve({
          data: {
            records: [
              docListRecord("loose1", {
                title: "Loose Article",
                path: "/loose1",
                createdAt: "2026-01-01T00:00:00Z",
              }),
            ],
          },
        });
      }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    const result = await callLoader();

    expect(result.standaloneArticles[0].pendingPublish).toBeUndefined();
  });

  // ADR 0021 point 3 — the loader wires listContributorSites in directly;
  // this is the wiring test, not a re-test of resolveMembershipSites itself
  // (already covered in contributorRoster.server.test.ts).
  it("wires listContributorSites into contributorSites", async () => {
    const contributorSiteUri =
      "at://did:plc:owner/site.standard.publication/my-site";
    contributorMemberships.upsert(
      DID,
      contributorSiteUri,
      "2026-01-01T00:00:00.000Z",
      "accepted",
    );
    vi.mocked(fetchBskyProfile).mockResolvedValue({
      did: "did:plc:owner",
      handle: "owner.bsky.social",
      displayName: "Site Owner",
    } as never);
    vi.stubGlobal(
      "fetch",
      mockFetchForSites({
        "my-site": { scribe: { title: "My Site", domain: "example.com" } },
      }),
    );

    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({ data: { records: [] } }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    const result = await callLoader();

    expect(result.contributorSites).toEqual([
      {
        siteUri: contributorSiteUri,
        siteTitle: "My Site",
        siteDomain: "example.com",
        ownerDisplayName: "Site Owner",
      },
    ]);
    vi.unstubAllGlobals();
  });

  // Found live 2026-07-16, Phase 3c test pass (ADR 0023's Consequences): a
  // document a Contributor submitted, already approved onto the Owner's
  // site on a *previous* visit (so scribe.pendingPublish is already
  // cleared — this isn't re-testing reconcilePendingSubmission itself,
  // covered in submissionReview.server.test.ts), kept showing under
  // Standalone Articles with a live Publish button because assignmentMap
  // was only ever built from the caller's own sites. value.site being an
  // at:// URI pointing at someone else's site now triggers a cross-repo
  // resolve so it's classified correctly.
  describe("documents published to a site the caller doesn't own (ADR 0023 Consequences)", () => {
    const ownerDid = "did:plc:owner";
    const siteUri = `at://${ownerDid}/site.standard.publication/site-b`;

    it("classifies it as published, not standalone, with the resolved site's assignment", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetchForSites({
          "site-b": {
            scribe: {
              title: "Owner's Site",
              domain: "owner.example",
              basePath: "",
              groups: [
                {
                  slug: "g1",
                  title: "Group 1",
                  articles: [{ uri: `at://${DID}/site.standard.document/approved1` }],
                },
              ],
            },
          },
        }),
      );

      const agent = makeAgent({
        listRecords: vi.fn().mockImplementation(({ collection }) => {
          if (collection === "site.standard.publication") {
            return Promise.resolve({ data: { records: [] } });
          }
          return Promise.resolve({
            data: {
              records: [
                docListRecord("approved1", {
                  title: "Approved Article",
                  path: "/g1/approved1",
                  site: siteUri,
                  publishedAt: "2026-01-05T00:00:00Z",
                }),
              ],
            },
          });
        }),
      });
      vi.mocked(requireAtpAgent).mockResolvedValue({ agent, did: DID, handle: HANDLE });

      const result = await callLoader();

      expect(result.standaloneArticles).toEqual([]);
      expect(result.publishedArticles.map((a) => a.rkey)).toEqual(["approved1"]);
      expect(result.publishedArticles[0].assignments).toEqual([
        {
          siteTitle: "Owner's Site",
          siteRkey: "site-b",
          siteAtUri: siteUri,
          siteUrl: "owner.example",
          siteUrlPrefix: "",
          logoImageUrl: undefined,
          splashImageUrl: undefined,
          groupTitle: "Group 1",
          groupSlug: "g1",
        },
      ]);
      vi.unstubAllGlobals();
    });

    it("falls back to standalone (not a crash) when the external site fetch fails", async () => {
      vi.stubGlobal("fetch", mockFetchForSites({}));

      const agent = makeAgent({
        listRecords: vi.fn().mockImplementation(({ collection }) => {
          if (collection === "site.standard.publication") {
            return Promise.resolve({ data: { records: [] } });
          }
          return Promise.resolve({
            data: {
              records: [
                docListRecord("approved1", {
                  title: "Approved Article",
                  path: "/g1/approved1",
                  site: siteUri,
                  publishedAt: "2026-01-05T00:00:00Z",
                }),
              ],
            },
          });
        }),
      });
      vi.mocked(requireAtpAgent).mockResolvedValue({ agent, did: DID, handle: HANDLE });

      const result = await callLoader();

      expect(result.standaloneArticles.map((a) => a.rkey)).toEqual(["approved1"]);
      expect(result.publishedArticles).toEqual([]);
      vi.unstubAllGlobals();
    });
  });

  // ADR 0023 — Contributor-side reconciliation runs inline in this loader.
  // Full behavioral coverage of reconcilePendingSubmission itself lives in
  // submissionReview.server.test.ts; this is the wiring test — does the
  // loader call it per document and reflect the result in the same request.
  describe("Contributor-side reconciliation (ADR 0023)", () => {
    const looseUri = `at://${DID}/site.standard.document/loose1`;
    const ownerSiteUri = "at://did:plc:owner/site.standard.publication/site-a";

    it("detects an approval via the cross-repo manifest read and clears pendingPublish in the same request", async () => {
      const agent = makeAgent({
        listRecords: vi.fn().mockImplementation(({ collection }) => {
          if (collection === "site.standard.publication") {
            return Promise.resolve({ data: { records: [] } });
          }
          return Promise.resolve({
            data: {
              records: [
                docListRecord(
                  "loose1",
                  {
                    title: "Loose Article",
                    path: "/loose1",
                    createdAt: "2026-01-01T00:00:00Z",
                    site: `https://reader.scribe-atp.app/${DID}/site.standard.document/loose1`,
                    scribe: {
                      pendingPublish: {
                        siteUri: ownerSiteUri,
                        submittedAt: "2026-07-15T00:00:00.000Z",
                      },
                    },
                  },
                  "loose1-cid",
                ),
              ],
            },
          });
        }),
        putRecord: vi.fn().mockResolvedValue({ data: {} }),
      });
      vi.mocked(requireAtpAgent).mockResolvedValue({ agent, did: DID, handle: HANDLE });
      vi.mocked(fetchBskyProfile).mockResolvedValue({
        did: "did:plc:owner",
        handle: "owner.bsky.social",
        displayName: "Site Owner",
      } as never);
      vi.stubGlobal(
        "fetch",
        mockFetchForSites({
          "site-a": {
            scribe: {
              domain: "example.com",
              basePath: "",
              groups: [{ slug: "g1", title: "Group 1", articles: [{ uri: looseUri }] }],
            },
          },
        }),
      );

      const result = await callLoader();

      expect(agent.com.atproto.repo.putRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          repo: DID,
          collection: "site.standard.document",
          rkey: "loose1",
          record: expect.objectContaining({ site: ownerSiteUri }),
          swapRecord: "loose1-cid",
        }),
      );
      // Fixed live 2026-07-16 (was the ADR 0023 Consequences gap): the
      // finalizing write set value.site to the Owner's at:// URI, and the
      // loader now resolves that external site to correctly classify this
      // as published, not standalone.
      expect(result.standaloneArticles).toEqual([]);
      expect(result.publishedArticles).toEqual([
        expect.objectContaining({
          rkey: "loose1",
          assignments: [
            expect.objectContaining({
              siteRkey: "site-a",
              groupTitle: "Group 1",
              groupSlug: "g1",
            }),
          ],
        }),
      ]);
      // Phase 4 — Contributor-side toast surfacing (ADR 0023 + Phase 4).
      expect(result.justReconciled).toEqual([
        {
          outcome: "approved",
          documentTitle: "Loose Article",
          siteRkey: "site-a",
          siteTitle: "",
        },
      ]);
      vi.unstubAllGlobals();
    });

    it("surfaces a rejected outcome in justReconciled with the rejection reason", async () => {
      pendingSubmissions.create(
        looseUri,
        DID,
        ownerSiteUri,
        "did:plc:owner",
        "Loose Article",
        "2026-07-15T00:00:00.000Z",
      );
      pendingSubmissions.reject(looseUri, "Not a fit for this site.");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const agent = makeAgent({
        listRecords: vi.fn().mockImplementation(({ collection }) => {
          if (collection === "site.standard.publication") {
            return Promise.resolve({ data: { records: [] } });
          }
          return Promise.resolve({
            data: {
              records: [
                docListRecord(
                  "loose1",
                  {
                    title: "Loose Article",
                    path: "/loose1",
                    createdAt: "2026-01-01T00:00:00Z",
                    site: `https://reader.scribe-atp.app/${DID}/site.standard.document/loose1`,
                    scribe: {
                      pendingPublish: {
                        siteUri: ownerSiteUri,
                        submittedAt: "2026-07-15T00:00:00.000Z",
                      },
                    },
                  },
                  "loose1-cid",
                ),
              ],
            },
          });
        }),
        putRecord: vi.fn().mockResolvedValue({ data: {} }),
      });
      vi.mocked(requireAtpAgent).mockResolvedValue({ agent, did: DID, handle: HANDLE });

      const result = await callLoader();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.justReconciled).toEqual([
        {
          outcome: "rejected",
          documentTitle: "Loose Article",
          siteRkey: "site-a",
          rejectionReason: "Not a fit for this site.",
        },
      ]);
    });

    it("does not touch the PDS when the local pending_submissions row is still status: pending", async () => {
      pendingSubmissions.create(
        looseUri,
        DID,
        ownerSiteUri,
        "did:plc:owner",
        "Loose Article",
        "2026-07-15T00:00:00.000Z",
      );
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const agent = makeAgent({
        listRecords: vi.fn().mockImplementation(({ collection }) => {
          if (collection === "site.standard.publication") {
            return Promise.resolve({ data: { records: [] } });
          }
          return Promise.resolve({
            data: {
              records: [
                docListRecord(
                  "loose1",
                  {
                    title: "Loose Article",
                    path: "/loose1",
                    createdAt: "2026-01-01T00:00:00Z",
                    site: `https://reader.scribe-atp.app/${DID}/site.standard.document/loose1`,
                    scribe: {
                      pendingPublish: {
                        siteUri: ownerSiteUri,
                        submittedAt: "2026-07-15T00:00:00.000Z",
                      },
                    },
                  },
                  "loose1-cid",
                ),
              ],
            },
          });
        }),
      });
      vi.mocked(requireAtpAgent).mockResolvedValue({ agent, did: DID, handle: HANDLE });

      const result = await callLoader();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(agent.com.atproto.repo.putRecord).not.toHaveBeenCalled();
      expect(result.standaloneArticles[0].pendingPublish).toEqual({
        siteUri: ownerSiteUri,
        submittedAt: "2026-07-15T00:00:00.000Z",
      });
    });

    it("a reconciliation failure for one document doesn't break the page load", async () => {
      const agent = makeAgent({
        listRecords: vi.fn().mockImplementation(({ collection }) => {
          if (collection === "site.standard.publication") {
            return Promise.resolve({ data: { records: [] } });
          }
          return Promise.resolve({
            data: {
              records: [
                docListRecord(
                  "loose1",
                  {
                    title: "Loose Article",
                    path: "/loose1",
                    createdAt: "2026-01-01T00:00:00Z",
                    site: `https://reader.scribe-atp.app/${DID}/site.standard.document/loose1`,
                    scribe: {
                      pendingPublish: {
                        siteUri: ownerSiteUri,
                        submittedAt: "2026-07-15T00:00:00.000Z",
                      },
                    },
                  },
                  "loose1-cid",
                ),
              ],
            },
          });
        }),
      });
      vi.mocked(requireAtpAgent).mockResolvedValue({ agent, did: DID, handle: HANDLE });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      const result = await callLoader();

      expect(result.standaloneArticles[0]).toEqual(
        expect.objectContaining({ rkey: "loose1" }),
      );
      vi.unstubAllGlobals();
    });
  });
});

describe("action", () => {
  it("deletes the document with the provided cid as swapRecord", async () => {
    const deleteRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({
      deleteRecord,
      listRecords: vi.fn().mockResolvedValue({ data: { records: [] } }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    await expect(
      callAction({ rkey: "orphan1", cid: "orphan1-cid" }),
    ).resolves.toEqual({ ok: true });

    expect(deleteRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.document",
      rkey: "orphan1",
      swapRecord: "orphan1-cid",
    });
  });

  it("bug fix: removes the ArticleRef from every site that references the deleted article", async () => {
    const articleUri = `at://${DID}/site.standard.document/orphan1`;
    const deleteRecord = vi.fn().mockResolvedValue({ data: {} });
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      deleteRecord,
      putRecord,
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            siteListRecord("site-a", {
              ungroupedArticles: [{ uri: articleUri }],
              groups: [],
            }),
          ],
        },
      }),
      getRecord: vi.fn().mockResolvedValue({
        data: {
          cid: "site-a-cid",
          value: {
            scribe: { ungroupedArticles: [{ uri: articleUri }], groups: [] },
          },
        },
      }),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    await callAction({ rkey: "orphan1", cid: "orphan1-cid" });

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        rkey: "site-a",
        record: expect.objectContaining({
          scribe: expect.objectContaining({ ungroupedArticles: [] }),
        }),
      }),
    );
  });

  it("bug fix: catches a PDS failure and returns an error instead of throwing", async () => {
    const agent = makeAgent({
      deleteRecord: vi.fn().mockRejectedValue(new Error("PDS down")),
    });
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent,
      did: DID,
      handle: HANDLE,
    });

    const result = await callAction({ rkey: "orphan1", cid: "orphan1-cid" });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  describe("unpublishArticle", () => {
    const articleUri = `at://${DID}/site.standard.document/grouped1`;

    function makeUnpublishAgent(getRecordOverrides?: {
      site?: Record<string, unknown>;
      document?: Record<string, unknown>;
    }) {
      const putRecord = vi.fn().mockResolvedValue({ data: {} });
      const getRecord = vi.fn().mockImplementation(({ collection }) => {
        if (collection === "site.standard.publication") {
          return Promise.resolve({
            data: {
              cid: "site-a-cid",
              value: {
                scribe: {
                  groups: [
                    {
                      slug: "g1",
                      title: "Group 1",
                      articles: [{ uri: articleUri }],
                    },
                  ],
                  ...getRecordOverrides?.site,
                },
              },
            },
          });
        }
        return Promise.resolve({
          data: {
            cid: "grouped1-cid",
            value: {
              title: "Grouped",
              path: "/g1/grouped1",
              publishedAt: "2026-01-02T00:00:00Z",
              site: `at://${DID}/site.standard.publication/site-a`,
              scribe: { domain: "a.com" },
              ...getRecordOverrides?.document,
            },
          },
        });
      });
      const agent = makeAgent({ getRecord, putRecord });
      return { agent, getRecord, putRecord };
    }

    it("requires both uri and siteRkey", async () => {
      await expect(
        callAction({ _intent: "unpublishArticle", uri: articleUri }),
      ).resolves.toEqual({
        ok: false,
        error: "An article and a site are required.",
      });
      expect(requireAtpAgent).not.toHaveBeenCalled();
    });

    it("clears the ArticleRef from the site and resets the document to loose", async () => {
      const { agent, putRecord } = makeUnpublishAgent();
      vi.mocked(requireAtpAgent).mockResolvedValue({
        agent,
        did: DID,
        handle: HANDLE,
      });

      await expect(
        callAction({
          _intent: "unpublishArticle",
          uri: articleUri,
          siteRkey: "site-a",
        }),
      ).resolves.toEqual({ ok: true });

      expect(putRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "site.standard.publication",
          rkey: "site-a",
          record: expect.objectContaining({
            scribe: expect.objectContaining({ groups: [expect.objectContaining({ articles: [] })] }),
          }),
        }),
      );
      expect(putRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "site.standard.document",
          rkey: "grouped1",
          record: expect.objectContaining({
            site: expect.stringContaining("reader.scribe-atp.app"),
          }),
        }),
      );
    });

    it("returns an error when the underlying unpublish fails", async () => {
      const { agent } = makeUnpublishAgent();
      vi.mocked(agent.com.atproto.repo.putRecord).mockRejectedValue(
        new Error("PDS down"),
      );
      vi.mocked(requireAtpAgent).mockResolvedValue({
        agent,
        did: DID,
        handle: HANDLE,
      });

      await expect(
        callAction({
          _intent: "unpublishArticle",
          uri: articleUri,
          siteRkey: "site-a",
        }),
      ).resolves.toEqual({ ok: false, error: "Failed to unpublish article." });
    });
  });

  // ADR 0021 — publish and submit share one intent; the action derives which
  // branch applies from the submitted site URI's owner DID (point 1).
  describe("publishOrSubmitArticle", () => {
    it("requires both uri and siteUri", async () => {
      await expect(
        callAction({ _intent: "publishOrSubmitArticle", uri: "at://x" }),
      ).resolves.toEqual({
        ok: false,
        error: "An article and a site are required.",
      });
      expect(requireAtpAgent).not.toHaveBeenCalled();
    });

    describe("owned site (publish branch)", () => {
      const articleUri = `at://${DID}/site.standard.document/loose1`;
      const siteUri = `at://${DID}/site.standard.publication/site-a`;

      function makePublishAgent() {
        const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
        const getRecord = vi.fn().mockImplementation(({ collection }) => {
          if (collection === "site.standard.publication") {
            return Promise.resolve({
              data: {
                cid: "site-a-cid",
                value: {
                  scribe: {
                    title: "Site A",
                    domain: "a.com",
                    basePath: "",
                    groups: [{ slug: "g1", title: "Group 1", articles: [] }],
                    ungroupedArticles: [],
                  },
                },
              },
            });
          }
          return Promise.resolve({
            data: {
              cid: "loose1-cid",
              value: {
                title: "Loose Article",
                path: "/loose1",
                createdAt: "2026-01-01T00:00:00Z",
                site: `https://reader.scribe-atp.app/${DID}/site.standard.document/loose1`,
              },
            },
          });
        });
        const listRecords = vi.fn().mockResolvedValue({ data: { records: [] } });
        return { agent: makeAgent({ getRecord, putRecord, listRecords }), putRecord };
      }

      it("derives siteRkey from the owned siteUri and publishes into the chosen group", async () => {
        const { agent, putRecord } = makePublishAgent();
        vi.mocked(requireAtpAgent).mockResolvedValue({
          agent,
          did: DID,
          handle: HANDLE,
        });

        const result = await callAction({
          _intent: "publishOrSubmitArticle",
          uri: articleUri,
          siteUri,
          groupSlug: "g1",
        });

        expect(result).toEqual(expect.objectContaining({ ok: true }));
        expect(putRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            collection: "site.standard.document",
            rkey: "loose1",
            record: expect.objectContaining({ site: siteUri }),
          }),
        );
      });
    });

    describe("Contributor site (submit branch)", () => {
      const contributorDid = "did:plc:contributor";
      const ownerDid = "did:plc:owner";
      const articleUri = `at://${contributorDid}/site.standard.document/loose1`;
      const ownerSiteUri = `at://${ownerDid}/site.standard.publication/site-b`;

      function makeSubmitAgent(docOverrides?: Record<string, unknown>) {
        const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
        const getRecord = vi.fn().mockResolvedValue({
          data: {
            cid: "loose1-cid",
            value: {
              title: "Loose Article",
              path: "/loose1",
              createdAt: "2026-01-01T00:00:00Z",
              site: `https://reader.scribe-atp.app/${contributorDid}/site.standard.document/loose1`,
              ...docOverrides,
            },
          },
        });
        return { agent: makeAgent({ getRecord, putRecord }), putRecord };
      }

      it("writes scribe.pendingPublish on the Contributor's own document and records a pending_submissions row", async () => {
        const { agent, putRecord } = makeSubmitAgent();
        vi.mocked(requireAtpAgent).mockResolvedValue({
          agent,
          did: contributorDid,
          handle: "contributor.bsky.social",
        });

        const result = await callAction({
          _intent: "publishOrSubmitArticle",
          uri: articleUri,
          siteUri: ownerSiteUri,
        });

        expect(result).toEqual({ ok: true });
        expect(putRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            collection: "site.standard.document",
            rkey: "loose1",
            record: expect.objectContaining({
              scribe: expect.objectContaining({
                pendingPublish: expect.objectContaining({ siteUri: ownerSiteUri }),
              }),
            }),
            swapRecord: "loose1-cid",
          }),
        );

        expect(pendingSubmissions.get(articleUri)).toEqual(
          expect.objectContaining({
            documentUri: articleUri,
            contributorDid,
            siteUri: ownerSiteUri,
            ownerDid,
            documentTitle: "Loose Article",
            status: "pending",
          }),
        );
      });

      it("guard: rejects submitting a document that's already published", async () => {
        const { agent, putRecord } = makeSubmitAgent({
          site: `at://${contributorDid}/site.standard.publication/own-site`,
        });
        vi.mocked(requireAtpAgent).mockResolvedValue({
          agent,
          did: contributorDid,
          handle: "contributor.bsky.social",
        });

        const result = await callAction({
          _intent: "publishOrSubmitArticle",
          uri: articleUri,
          siteUri: ownerSiteUri,
        });

        expect(result).toEqual({
          ok: false,
          error: "This article is already published.",
        });
        expect(putRecord).not.toHaveBeenCalled();
      });

      it("guard: rejects submitting a document that already has a pending submission", async () => {
        const { agent, putRecord } = makeSubmitAgent({
          scribe: {
            pendingPublish: {
              siteUri: "at://did:plc:otherowner/site.standard.publication/other-site",
              submittedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        });
        vi.mocked(requireAtpAgent).mockResolvedValue({
          agent,
          did: contributorDid,
          handle: "contributor.bsky.social",
        });

        const result = await callAction({
          _intent: "publishOrSubmitArticle",
          uri: articleUri,
          siteUri: ownerSiteUri,
        });

        expect(result).toEqual({
          ok: false,
          error: "This article already has a pending submission.",
        });
        expect(putRecord).not.toHaveBeenCalled();
      });
    });
  });

  describe("notifySubscribers", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn();
      process.env.NOTIFY_SECRET = "test-secret";
    });

    afterEach(() => {
      global.fetch = originalFetch;
      delete process.env.NOTIFY_SECRET;
    });

    it("security fix: requires authentication before calling the social service", async () => {
      const redirectToLogin = new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
      vi.mocked(requireAuth).mockRejectedValue(redirectToLogin);

      const thrown = await callAction({
        _intent: "notifySubscribers",
        publicationUri: `at://${DID}/site.standard.publication/site-a`,
        articleTitle: "Title",
        canonicalUrl: "https://example.com/a",
      }).catch((err) => err);

      expect(thrown).toBe(redirectToLogin);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("security fix: rejects a publicationUri that does not belong to the caller", async () => {
      vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: HANDLE });

      const result = await callAction({
        _intent: "notifySubscribers",
        publicationUri: "at://did:plc:someoneelse/site.standard.publication/site-a",
        articleTitle: "Title",
        canonicalUrl: "https://example.com/a",
      });

      expect(result).toEqual({ ok: false, sent: 0, skipped: 0 });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls the social service when authenticated and the publication belongs to the caller", async () => {
      vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: HANDLE });
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true, sent: 3, skipped: 1 }), {
          status: 200,
        }),
      );

      const result = await callAction({
        _intent: "notifySubscribers",
        publicationUri: `at://${DID}/site.standard.publication/site-a`,
        articleTitle: "Title",
        canonicalUrl: "https://example.com/a",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: true, sent: 3, skipped: 1 });
    });
  });
});
