import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@atproto/api";
import { findSitesContaining } from "./articleSiteSync.server";

// ---------------------------------------------------------------------------
// findSitesContaining
// ---------------------------------------------------------------------------

const DID = "did:example:alice";
const ARTICLE_URI = `at://${DID}/site.standard.document/my-post`;
const OTHER_URI = `at://${DID}/site.standard.document/other-post`;

function makeRef(uri: string) {
  return { uri, title: "T", slug: "t", splashImageUrl: null, description: null, createdAt: "2024-01-01" };
}

function makeAgent(records: Array<{ uri: string; value: unknown }>) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords: vi.fn().mockResolvedValue({ data: { records } }),
        },
      },
    },
  } as unknown as Agent;
}

describe("findSitesContaining", () => {
  it("returns rkey of a site that references the article in ungroupedArticles", async () => {
    const agent = makeAgent([
      {
        uri: `at://${DID}/site.standard.publication/site-a`,
        value: { scribe: { ungroupedArticles: [makeRef(ARTICLE_URI)], groups: [] } },
      },
    ]);
    expect(await findSitesContaining(agent, DID, ARTICLE_URI)).toEqual(["site-a"]);
  });

  it("returns rkey of a site that references the article inside a group", async () => {
    const agent = makeAgent([
      {
        uri: `at://${DID}/site.standard.publication/site-b`,
        value: {
          scribe: {
            ungroupedArticles: [],
            groups: [{ slug: "g1", title: "G", articles: [makeRef(ARTICLE_URI)] }],
          },
        },
      },
    ]);
    expect(await findSitesContaining(agent, DID, ARTICLE_URI)).toEqual(["site-b"]);
  });

  it("excludes sites that only reference other articles", async () => {
    const agent = makeAgent([
      {
        uri: `at://${DID}/site.standard.publication/site-a`,
        value: {
          scribe: {
            ungroupedArticles: [makeRef(OTHER_URI)],
            groups: [{ slug: "g1", title: "G", articles: [makeRef(OTHER_URI)] }],
          },
        },
      },
    ]);
    expect(await findSitesContaining(agent, DID, ARTICLE_URI)).toEqual([]);
  });

  it("returns multiple rkeys when the article appears in more than one site", async () => {
    const agent = makeAgent([
      {
        uri: `at://${DID}/site.standard.publication/site-a`,
        value: { scribe: { ungroupedArticles: [makeRef(ARTICLE_URI)], groups: [] } },
      },
      {
        uri: `at://${DID}/site.standard.publication/site-b`,
        value: {
          scribe: {
            ungroupedArticles: [],
            groups: [{ slug: "g1", title: "G", articles: [makeRef(ARTICLE_URI)] }],
          },
        },
      },
    ]);
    const result = await findSitesContaining(agent, DID, ARTICLE_URI);
    expect(result).toContain("site-a");
    expect(result).toContain("site-b");
    expect(result).toHaveLength(2);
  });

  it("handles site records with missing ungroupedArticles and groups", async () => {
    const agent = makeAgent([
      { uri: `at://${DID}/site.standard.publication/site-a`, value: {} },
    ]);
    expect(await findSitesContaining(agent, DID, ARTICLE_URI)).toEqual([]);
  });

  it("returns empty array when there are no site records", async () => {
    const agent = makeAgent([]);
    expect(await findSitesContaining(agent, DID, ARTICLE_URI)).toEqual([]);
  });
});
