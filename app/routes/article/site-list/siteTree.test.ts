import { describe, it, expect } from "vitest";
import type { ArticleRef } from "~/hooks/types";
import {
  slugFromUri,
  articleId,
  groupId,
  toSlug,
  nodeFromRef,
  articleRefFromNode,
  buildTreeFromSite,
  treeToSiteData,
  removeArticleRef,
  updateArticleRef,
  type SiteManifest,
  type SiteRecordValue,
  type TreeGroupNode,
} from "./siteTree";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ref = (
  slug: string,
  overrides: Partial<ArticleRef> = {},
): ArticleRef => ({
  uri: `at://did:plc:test/site.standard.document/${slug}`,
  title: `Article: ${slug}`,
  slug,
  splashImageUrl: null,
  description: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const emptySite: SiteManifest = {
  rkey: "my-site",
  cid: "bafy123",
  url: "example.com",
  title: "My Site",
  urlPrefix: "blog",
  groups: [],
  ungroupedArticles: [],
};

// ─── slugFromUri ──────────────────────────────────────────────────────────────

describe("slugFromUri", () => {
  it("returns the final path segment of an AT URI", () => {
    expect(slugFromUri("at://did:plc:abc/site.standard.document/my-post")).toBe(
      "my-post",
    );
  });

  it("works for any URI depth", () => {
    expect(slugFromUri("at://did/collection/rkey")).toBe("rkey");
  });

  it("works when the slug contains hyphens and numbers", () => {
    expect(slugFromUri("at://did/col/hello-world-123")).toBe("hello-world-123");
  });
});

// ─── articleId / groupId ─────────────────────────────────────────────────────

describe("articleId", () => {
  it("prefixes the slug with 'a:'", () => {
    expect(articleId("my-post")).toBe("a:my-post");
  });
});

describe("groupId", () => {
  it("prefixes the slug with 'g:'", () => {
    expect(groupId("engineering")).toBe("g:engineering");
  });
});

// ─── toSlug ───────────────────────────────────────────────────────────────────

describe("toSlug", () => {
  it("lowercases the title", () => {
    expect(toSlug("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(toSlug("my article title")).toBe("my-article-title");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(toSlug("hello  world")).toBe("hello-world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(toSlug("  hello  ")).toBe("hello");
  });

  it("strips special characters", () => {
    expect(toSlug("Hello, World!")).toBe("hello-world");
  });

  it("preserves existing hyphens", () => {
    expect(toSlug("already-slugged")).toBe("already-slugged");
  });

  it("preserves numbers", () => {
    expect(toSlug("Article 42")).toBe("article-42");
  });
});

// ─── nodeFromRef ─────────────────────────────────────────────────────────────

describe("nodeFromRef", () => {
  it("maps all ArticleRef fields onto the node", () => {
    const input = ref("my-post", {
      slug: "my-post",
      description: "A summary",
      splashImageUrl: "https://example.com/img.jpg",
      contributors: [{ did: "did:plc:abc", role: "Editor", displayName: "A" }],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
    });
    const node = nodeFromRef(input);
    expect(node.kind).toBe("article");
    expect(node.id).toBe("a:my-post");
    expect(node.uri).toBe(input.uri);
    expect(node.title).toBe(input.title);
    expect(node.slug).toBe("my-post");
    expect(node.description).toBe("A summary");
    expect(node.splashImageUrl).toBe("https://example.com/img.jpg");
    expect(node.contributors).toEqual([
      { did: "did:plc:abc", role: "Editor", displayName: "A" },
    ]);
    expect(node.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(node.updatedAt).toBe("2025-06-01T00:00:00.000Z");
  });

  it("preserves null splashImageUrl", () => {
    expect(
      nodeFromRef(ref("p", { splashImageUrl: null })).splashImageUrl,
    ).toBeNull();
  });

  it("preserves undefined optional fields", () => {
    const node = nodeFromRef(ref("p"));
    expect(node.updatedAt).toBeUndefined();
    expect(node.description).toBeNull();
  });
});

// ─── articleRefFromNode ───────────────────────────────────────────────────────

describe("articleRefFromNode", () => {
  it("maps all node fields back onto an ArticleRef", () => {
    const input = ref("my-post", {
      slug: "my-post",
      description: "A summary",
      splashImageUrl: "https://example.com/img.jpg",
      contributors: [{ did: "did:plc:abc", role: "Editor", displayName: "A" }],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
    });
    const roundTripped = articleRefFromNode(nodeFromRef(input));
    expect(roundTripped).toEqual(input);
  });

  it("does not include the DnD id or kind on the ArticleRef", () => {
    const result = articleRefFromNode(
      nodeFromRef(ref("my-post")),
    ) as unknown as Record<string, unknown>;
    expect(result.id).toBeUndefined();
    expect(result.kind).toBeUndefined();
  });
});

// ─── buildTreeFromSite ────────────────────────────────────────────────────────

describe("buildTreeFromSite", () => {
  it("always produces a root node as the first element", () => {
    const tree = buildTreeFromSite(emptySite);
    expect(tree[0].id).toBe("g:root");
    expect(tree[0].slug).toBe("root");
  });

  it("produces only the root node when the site has no groups or articles", () => {
    const tree = buildTreeFromSite(emptySite);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(0);
  });

  it("maps ungrouped articles into the root node's children", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [ref("hello-world"), ref("second-post")],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].uri).toBe(ref("hello-world").uri);
    expect(tree[0].children[1].uri).toBe(ref("second-post").uri);
  });

  it("assigns each article a DnD id derived from the URI slug", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [ref("my-article")],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].id).toBe("a:my-article");
  });

  it("maps named groups after the root node", () => {
    const site: SiteManifest = {
      ...emptySite,
      groups: [
        { slug: "engineering", title: "Engineering", articles: [] },
        { slug: "design", title: "Design", articles: [] },
      ],
    };
    const tree = buildTreeFromSite(site);
    expect(tree).toHaveLength(3); // root + 2 groups
    expect(tree[1].slug).toBe("engineering");
    expect(tree[2].slug).toBe("design");
  });

  it("assigns each named group a DnD id derived from its slug", () => {
    const site: SiteManifest = {
      ...emptySite,
      groups: [{ slug: "engineering", title: "Engineering", articles: [] }],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[1].id).toBe("g:engineering");
  });

  it("maps articles within named groups into that group's children", () => {
    const site: SiteManifest = {
      ...emptySite,
      groups: [
        {
          slug: "engineering",
          title: "Engineering",
          articles: [ref("deep-dive"), ref("intro")],
        },
      ],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[1].children).toHaveLength(2);
    expect(tree[1].children[0].title).toBe("Article: deep-dive");
  });

  it("preserves the slug field on article nodes", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [ref("my-post", { slug: "my-post" })],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].slug).toBe("my-post");
  });

  it("preserves the description field on article nodes", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [ref("my-post", { description: "A short summary" })],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].description).toBe("A short summary");
  });

  it("preserves splashImageUrl on article nodes", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [
        ref("my-post", { splashImageUrl: "https://example.com/img.jpg" }),
      ],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].splashImageUrl).toBe(
      "https://example.com/img.jpg",
    );
  });

  it("preserves createdAt on article nodes", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [
        ref("my-post", { createdAt: "2025-06-01T12:00:00.000Z" }),
      ],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].createdAt).toBe("2025-06-01T12:00:00.000Z");
  });
});

// ─── treeToSiteData ───────────────────────────────────────────────────────────

describe("treeToSiteData", () => {
  it("returns empty groups and articles for a tree with only an empty root", () => {
    const tree: TreeGroupNode[] = [
      {
        kind: "group",
        id: "g:root",
        slug: "root",
        title: "Ungrouped",
        children: [],
      },
    ];
    expect(treeToSiteData(tree)).toEqual({ groups: [], ungroupedArticles: [] });
  });

  it("places root children into the articles array", () => {
    const tree: TreeGroupNode[] = [
      {
        kind: "group",
        id: "g:root",
        slug: "root",
        title: "Ungrouped",
        children: [
          {
            kind: "article",
            id: "a:my-post",
            uri: "at://did/col/my-post",
            title: "My Post",
            slug: "my-post",
            splashImageUrl: null,
            description: null,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      },
    ];
    const { ungroupedArticles, groups } = treeToSiteData(tree);
    expect(groups).toHaveLength(0);
    expect(ungroupedArticles).toHaveLength(1);
    expect(ungroupedArticles[0].uri).toBe("at://did/col/my-post");
  });

  it("places non-root nodes into the groups array", () => {
    const tree: TreeGroupNode[] = [
      {
        kind: "group",
        id: "g:root",
        slug: "root",
        title: "Ungrouped",
        children: [],
      },
      {
        kind: "group",
        id: "g:engineering",
        slug: "engineering",
        title: "Engineering",
        children: [],
      },
    ];
    const { groups } = treeToSiteData(tree);
    expect(groups).toHaveLength(1);
    expect(groups[0].slug).toBe("engineering");
  });
});

// ─── removeArticleRef ─────────────────────────────────────────────────────────

const makeRecord = (
  overrides: Partial<SiteRecordValue> = {},
): SiteRecordValue => ({
  $type: "site.standard.publication",
  title: "My Site",
  url: "example.com",
  urlPrefix: "blog",
  ungroupedArticles: [],
  groups: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

describe("removeArticleRef", () => {
  it("removes a matching ref from top-level articles", () => {
    const record = makeRecord({
      ungroupedArticles: [ref("keep"), ref("remove")],
    });
    const result = removeArticleRef(record, ref("remove").uri);
    expect(result.ungroupedArticles).toHaveLength(1);
    expect(result.ungroupedArticles[0].uri).toBe(ref("keep").uri);
  });

  it("removes a matching ref from inside a group", () => {
    const record = makeRecord({
      groups: [
        {
          slug: "eng",
          title: "Engineering",
          articles: [ref("keep"), ref("remove")],
        },
      ],
    });
    const result = removeArticleRef(record, ref("remove").uri);
    expect(result.groups[0].articles).toHaveLength(1);
    expect(result.groups[0].articles[0].uri).toBe(ref("keep").uri);
  });

  it("leaves articles with non-matching URIs untouched", () => {
    const record = makeRecord({
      ungroupedArticles: [ref("keep-a"), ref("keep-b")],
    });
    const result = removeArticleRef(record, "at://did/col/ghost");
    expect(result.ungroupedArticles).toHaveLength(2);
  });

  it("preserves unknown fields on the record", () => {
    const record = makeRecord({
      contributors: ["did:plc:alice"],
    } as Partial<SiteRecordValue>);
    const result = removeArticleRef(record, "at://did/col/ghost");
    expect((result as Record<string, unknown>).contributors).toEqual([
      "did:plc:alice",
    ]);
  });

  it("preserves unknown fields on groups", () => {
    const record = makeRecord({
      groups: [
        { slug: "eng", title: "Engineering", articles: [], someFlag: true },
      ],
    });
    const result = removeArticleRef(record, "at://did/col/ghost");
    expect((result.groups[0] as Record<string, unknown>).someFlag).toBe(true);
  });

  it("updates updatedAt on the record", () => {
    const before = "2024-01-01T00:00:00.000Z";
    const record = makeRecord({ updatedAt: before });
    const result = removeArticleRef(record, "at://did/col/ghost");
    expect(result.updatedAt).not.toBe(before);
  });
});

// ─── updateArticleRef ─────────────────────────────────────────────────────────

describe("updateArticleRef", () => {
  const newRef: ArticleRef = {
    uri: "at://did:plc:test/site.standard.document/renamed",
    title: "Renamed",
    slug: "renamed",
    splashImageUrl: null,
    description: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };

  it("replaces a matching ref in top-level articles", () => {
    const record = makeRecord({
      ungroupedArticles: [ref("old"), ref("other")],
    });
    const result = updateArticleRef(record, ref("old").uri, newRef);
    expect(result.ungroupedArticles[0].uri).toBe(newRef.uri);
    expect(result.ungroupedArticles[1].uri).toBe(ref("other").uri);
  });

  it("replaces a matching ref inside a group", () => {
    const record = makeRecord({
      groups: [
        {
          slug: "eng",
          title: "Engineering",
          articles: [ref("old"), ref("other")],
        },
      ],
    });
    const result = updateArticleRef(record, ref("old").uri, newRef);
    expect(result.groups[0].articles[0].uri).toBe(newRef.uri);
    expect(result.groups[0].articles[1].uri).toBe(ref("other").uri);
  });

  it("is a no-op when the URI is not found", () => {
    const record = makeRecord({ ungroupedArticles: [ref("keep")] });
    const result = updateArticleRef(record, "at://did/col/ghost", newRef);
    expect(result.ungroupedArticles[0].uri).toBe(ref("keep").uri);
  });

  it("preserves unknown fields on the record", () => {
    const record = makeRecord({
      contributors: ["did:plc:alice"],
    } as Partial<SiteRecordValue>);
    const result = updateArticleRef(record, "at://did/col/ghost", newRef);
    expect((result as Record<string, unknown>).contributors).toEqual([
      "did:plc:alice",
    ]);
  });

  it("updates updatedAt on the record", () => {
    const before = "2024-01-01T00:00:00.000Z";
    const record = makeRecord({ updatedAt: before });
    const result = updateArticleRef(record, "at://did/col/ghost", newRef);
    expect(result.updatedAt).not.toBe(before);
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe("buildTreeFromSite → treeToSiteData round-trip", () => {
  it("reproduces the original ungrouped articles unchanged", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [
        ref("post-one", {
          slug: "post-one",
          description: "First summary",
          splashImageUrl: "https://img.example.com/1.jpg",
        }),
        ref("post-two", { slug: "post-two", description: null }),
      ],
    };
    const { ungroupedArticles } = treeToSiteData(buildTreeFromSite(site));
    expect(ungroupedArticles).toEqual(site.ungroupedArticles);
  });

  it("reproduces the original groups and their articles unchanged", () => {
    const site: SiteManifest = {
      ...emptySite,
      groups: [
        {
          slug: "engineering",
          title: "Engineering",
          articles: [
            ref("deep-dive", { slug: "deep-dive", description: "A deep dive" }),
            ref("intro", { slug: "intro", description: null }),
          ],
        },
        {
          slug: "design",
          title: "Design",
          articles: [ref("ui-patterns", { slug: "ui-patterns" })],
        },
      ],
    };
    const { groups } = treeToSiteData(buildTreeFromSite(site));
    expect(groups).toEqual(site.groups);
  });

  it("preserves slug on ungrouped articles through the round-trip", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [ref("my-post", { slug: "my-post" })],
    };
    const { ungroupedArticles } = treeToSiteData(buildTreeFromSite(site));
    expect(ungroupedArticles[0].slug).toBe("my-post");
  });

  it("preserves description on ungrouped articles through the round-trip", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [
        ref("my-post", { description: "A short summary of the post" }),
      ],
    };
    const { ungroupedArticles } = treeToSiteData(buildTreeFromSite(site));
    expect(ungroupedArticles[0].description).toBe("A short summary of the post");
  });

  it("preserves slug on articles inside named groups through the round-trip", () => {
    const site: SiteManifest = {
      ...emptySite,
      groups: [
        {
          slug: "eng",
          title: "Engineering",
          articles: [ref("my-post", { slug: "my-post" })],
        },
      ],
    };
    const { groups } = treeToSiteData(buildTreeFromSite(site));
    expect(groups[0].articles[0].slug).toBe("my-post");
  });

  it("preserves description on articles inside named groups through the round-trip", () => {
    const site: SiteManifest = {
      ...emptySite,
      groups: [
        {
          slug: "eng",
          title: "Engineering",
          articles: [ref("my-post", { description: "A group article summary" })],
        },
      ],
    };
    const { groups } = treeToSiteData(buildTreeFromSite(site));
    expect(groups[0].articles[0].description).toBe("A group article summary");
  });

  it("handles a full site with both ungrouped articles and named groups", () => {
    const site: SiteManifest = {
      ...emptySite,
      ungroupedArticles: [
        ref("standalone", { slug: "standalone", description: "Solo" }),
      ],
      groups: [
        {
          slug: "series",
          title: "Series",
          articles: [ref("part-1", { slug: "part-1", description: "Part one" })],
        },
      ],
    };
    const result = treeToSiteData(buildTreeFromSite(site));
    expect(result.ungroupedArticles).toEqual(site.ungroupedArticles);
    expect(result.groups).toEqual(site.groups);
  });
});
