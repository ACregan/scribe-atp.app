import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader, action } from "./list";
import { requireAtpAgent } from "~/services/auth.server";

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
  useRealOAuth: true,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
});

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
});
