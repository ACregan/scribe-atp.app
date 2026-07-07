import { describe, it, expect } from "vitest";
import {
  buildDocLocationMap,
  resolveCanonicalLocation,
  buildPlan,
} from "./repairDocumentPaths.server";

const DID = "did:plc:e2lcgwxhymx3q6u7blziecdr";

// Regression coverage for the 2026-07-07 incident: running the repair tool
// fixed 3 records but skipped a cross-posted article, because a naive
// Map<rkey, DocLocation> let whichever site was processed last silently win
// for any document referenced by more than one site's manifest. See
// [[urgent-article-path-basepath-bug]].

function siteRecord(rkey: string, scribe: Record<string, unknown>) {
  return {
    uri: `at://${DID}/site.standard.publication/${rkey}`,
    cid: `${rkey}-cid`,
    value: { $type: "site.standard.publication", scribe },
  };
}

function docRecord(rkey: string, value: Record<string, unknown>) {
  return {
    uri: `at://${DID}/site.standard.document/${rkey}`,
    cid: `${rkey}-cid`,
    value,
  };
}

describe("buildDocLocationMap — cross-posted articles", () => {
  it("collects every site a document is referenced by, not just the last one", () => {
    const articleRkey = "3mp47vunfy42h";
    const sites = [
      siteRecord("canonical-site", {
        domain: "anthonycregan.co.uk",
        basePath: "blog",
        groups: [
          {
            slug: "creative-writing",
            articles: [
              {
                uri: `at://${DID}/site.standard.document/${articleRkey}`,
                slug: "the-crows-of-shenton-way",
              },
            ],
          },
        ],
        ungroupedArticles: [],
      }),
      siteRecord("secondary-site", {
        domain: "norobots.blog",
        basePath: "",
        groups: [
          {
            slug: "creative-writing",
            articles: [
              {
                uri: `at://${DID}/site.standard.document/${articleRkey}`,
                slug: "the-crows-of-shenton-way",
              },
            ],
          },
        ],
        ungroupedArticles: [],
      }),
    ];

    const map = buildDocLocationMap(sites);
    const locations = map.get(articleRkey);

    expect(locations).toHaveLength(2);
    expect(locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ siteRkey: "canonical-site", basePath: "blog" }),
        expect.objectContaining({ siteRkey: "secondary-site", basePath: "" }),
      ]),
    );
  });
});

describe("resolveCanonicalLocation", () => {
  const locations = [
    { siteRkey: "canonical-site", slug: "a", groupSlug: "g", domain: "a.com", basePath: "blog" },
    { siteRkey: "secondary-site", slug: "a", groupSlug: "g", domain: "b.com", basePath: "" },
  ];

  it("picks the location matching the document's own site field", () => {
    const result = resolveCanonicalLocation(
      `at://${DID}/site.standard.publication/canonical-site`,
      locations,
    );
    expect(result?.siteRkey).toBe("canonical-site");
  });

  it("falls back to the first location when site field doesn't match any", () => {
    const result = resolveCanonicalLocation(
      `at://${DID}/site.standard.publication/some-other-site`,
      locations,
    );
    expect(result?.siteRkey).toBe("canonical-site");
  });
});

describe("buildPlan — reproduces the reported bug scenario exactly", () => {
  it("flags the cross-posted article for repair using its canonical site's basePath", () => {
    const articleRkey = "3mp47vunfy42h";
    const sites = [
      siteRecord("canonical-site", {
        domain: "anthonycregan.co.uk",
        basePath: "blog",
        groups: [
          {
            slug: "creative-writing",
            articles: [
              {
                uri: `at://${DID}/site.standard.document/${articleRkey}`,
                slug: "the-crows-of-shenton-way",
              },
            ],
          },
        ],
        ungroupedArticles: [],
      }),
      siteRecord("secondary-site", {
        domain: "norobots.blog",
        basePath: "",
        groups: [
          {
            slug: "creative-writing",
            articles: [
              {
                uri: `at://${DID}/site.standard.document/${articleRkey}`,
                slug: "the-crows-of-shenton-way",
              },
            ],
          },
        ],
        ungroupedArticles: [],
      }),
    ];

    const documents = [
      docRecord(articleRkey, {
        title: "The Crows Of Shenton Way.",
        path: "/creative-writing/the-crows-of-shenton-way",
        site: `at://${DID}/site.standard.publication/canonical-site`,
      }),
    ];

    const locationMap = buildDocLocationMap(sites);
    const plan = buildPlan(documents, locationMap);

    expect(plan.alreadyCorrect).toBe(0);
    expect(plan.toRepair).toEqual([
      expect.objectContaining({
        rkey: articleRkey,
        currentPath: "/creative-writing/the-crows-of-shenton-way",
        expectedPath: "/blog/creative-writing/the-crows-of-shenton-way",
        canonicalUrl:
          "https://anthonycregan.co.uk/blog/creative-writing/the-crows-of-shenton-way",
      }),
    ]);
  });

  it("without the canonical-site fix, would have wrongly marked it already-correct (documents the bug)", () => {
    // Same setup, but resolving location via naive last-one-wins instead of
    // resolveCanonicalLocation — demonstrates why the old code skipped it.
    const articleRkey = "3mp47vunfy42h";
    const sites = [
      siteRecord("canonical-site", {
        domain: "anthonycregan.co.uk",
        basePath: "blog",
        groups: [
          {
            slug: "creative-writing",
            articles: [
              {
                uri: `at://${DID}/site.standard.document/${articleRkey}`,
                slug: "the-crows-of-shenton-way",
              },
            ],
          },
        ],
        ungroupedArticles: [],
      }),
      siteRecord("secondary-site", {
        domain: "norobots.blog",
        basePath: "",
        groups: [
          {
            slug: "creative-writing",
            articles: [
              {
                uri: `at://${DID}/site.standard.document/${articleRkey}`,
                slug: "the-crows-of-shenton-way",
              },
            ],
          },
        ],
        ungroupedArticles: [],
      }),
    ];

    const locationMap = buildDocLocationMap(sites);
    const locations = locationMap.get(articleRkey)!;
    const lastWriteWinsLocation = locations[locations.length - 1];

    // The old (buggy) behaviour picked whichever site was processed last —
    // here that's the secondary site with an empty basePath, producing an
    // "expected" path identical to the already-broken stored path.
    expect(lastWriteWinsLocation.siteRkey).toBe("secondary-site");
    expect(lastWriteWinsLocation.basePath).toBe("");
  });
});
