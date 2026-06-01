import { describe, it, expect } from "vitest";
import {
  slugFromUri,
  articleId,
  groupId,
  toSlug,
  buildTreeFromSite,
  treeToSiteData,
  type SiteData,
  type SiteArticleRef,
  type TreeGroupNode,
} from "./siteTree";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ref = (slug: string, overrides: Partial<SiteArticleRef> = {}): SiteArticleRef => ({
  uri: `at://did:plc:test/app.scribe.article/${slug}`,
  title: `Article: ${slug}`,
  url: slug,
  splashImageUrl: null,
  synopsis: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const emptySite: SiteData = {
  rkey: "my-site",
  cid: "bafy123",
  url: "example.com",
  title: "My Site",
  urlPrefix: "blog",
  groups: [],
  articles: [],
};

// ─── slugFromUri ──────────────────────────────────────────────────────────────

describe("slugFromUri", () => {
  it("returns the final path segment of an AT URI", () => {
    expect(slugFromUri("at://did:plc:abc/app.scribe.article/my-post")).toBe("my-post");
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
    const site: SiteData = {
      ...emptySite,
      articles: [ref("hello-world"), ref("second-post")],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].uri).toBe(ref("hello-world").uri);
    expect(tree[0].children[1].uri).toBe(ref("second-post").uri);
  });

  it("assigns each article a DnD id derived from the URI slug", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("my-article")],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].id).toBe("a:my-article");
  });

  it("maps named groups after the root node", () => {
    const site: SiteData = {
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
    const site: SiteData = {
      ...emptySite,
      groups: [{ slug: "engineering", title: "Engineering", articles: [] }],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[1].id).toBe("g:engineering");
  });

  it("maps articles within named groups into that group's children", () => {
    const site: SiteData = {
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

  it("preserves the url field on article nodes", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("my-post", { url: "my-post" })],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].url).toBe("my-post");
  });

  it("preserves the synopsis field on article nodes", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("my-post", { synopsis: "A short summary" })],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].synopsis).toBe("A short summary");
  });

  it("preserves splashImageUrl on article nodes", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("my-post", { splashImageUrl: "https://example.com/img.jpg" })],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].splashImageUrl).toBe("https://example.com/img.jpg");
  });

  it("preserves createdAt on article nodes", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("my-post", { createdAt: "2025-06-01T12:00:00.000Z" })],
    };
    const tree = buildTreeFromSite(site);
    expect(tree[0].children[0].createdAt).toBe("2025-06-01T12:00:00.000Z");
  });
});

// ─── treeToSiteData ───────────────────────────────────────────────────────────

describe("treeToSiteData", () => {
  it("returns empty groups and articles for a tree with only an empty root", () => {
    const tree: TreeGroupNode[] = [
      { kind: "group", id: "g:root", slug: "root", title: "Ungrouped", children: [] },
    ];
    expect(treeToSiteData(tree)).toEqual({ groups: [], articles: [] });
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
            url: "my-post",
            splashImageUrl: null,
            synopsis: null,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      },
    ];
    const { articles, groups } = treeToSiteData(tree);
    expect(groups).toHaveLength(0);
    expect(articles).toHaveLength(1);
    expect(articles[0].uri).toBe("at://did/col/my-post");
  });

  it("places non-root nodes into the groups array", () => {
    const tree: TreeGroupNode[] = [
      { kind: "group", id: "g:root", slug: "root", title: "Ungrouped", children: [] },
      { kind: "group", id: "g:engineering", slug: "engineering", title: "Engineering", children: [] },
    ];
    const { groups } = treeToSiteData(tree);
    expect(groups).toHaveLength(1);
    expect(groups[0].slug).toBe("engineering");
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe("buildTreeFromSite → treeToSiteData round-trip", () => {
  it("reproduces the original ungrouped articles unchanged", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [
        ref("post-one", { url: "post-one", synopsis: "First summary", splashImageUrl: "https://img.example.com/1.jpg" }),
        ref("post-two", { url: "post-two", synopsis: null }),
      ],
    };
    const { articles } = treeToSiteData(buildTreeFromSite(site));
    expect(articles).toEqual(site.articles);
  });

  it("reproduces the original groups and their articles unchanged", () => {
    const site: SiteData = {
      ...emptySite,
      groups: [
        {
          slug: "engineering",
          title: "Engineering",
          articles: [
            ref("deep-dive", { url: "deep-dive", synopsis: "A deep dive" }),
            ref("intro", { url: "intro", synopsis: null }),
          ],
        },
        {
          slug: "design",
          title: "Design",
          articles: [ref("ui-patterns", { url: "ui-patterns" })],
        },
      ],
    };
    const { groups } = treeToSiteData(buildTreeFromSite(site));
    expect(groups).toEqual(site.groups);
  });

  it("preserves url on ungrouped articles through the round-trip", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("my-post", { url: "my-post" })],
    };
    const { articles } = treeToSiteData(buildTreeFromSite(site));
    expect(articles[0].url).toBe("my-post");
  });

  it("preserves synopsis on ungrouped articles through the round-trip", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("my-post", { synopsis: "A short summary of the post" })],
    };
    const { articles } = treeToSiteData(buildTreeFromSite(site));
    expect(articles[0].synopsis).toBe("A short summary of the post");
  });

  it("preserves url on articles inside named groups through the round-trip", () => {
    const site: SiteData = {
      ...emptySite,
      groups: [
        {
          slug: "eng",
          title: "Engineering",
          articles: [ref("my-post", { url: "my-post" })],
        },
      ],
    };
    const { groups } = treeToSiteData(buildTreeFromSite(site));
    expect(groups[0].articles[0].url).toBe("my-post");
  });

  it("preserves synopsis on articles inside named groups through the round-trip", () => {
    const site: SiteData = {
      ...emptySite,
      groups: [
        {
          slug: "eng",
          title: "Engineering",
          articles: [ref("my-post", { synopsis: "A group article summary" })],
        },
      ],
    };
    const { groups } = treeToSiteData(buildTreeFromSite(site));
    expect(groups[0].articles[0].synopsis).toBe("A group article summary");
  });

  it("handles a full site with both ungrouped articles and named groups", () => {
    const site: SiteData = {
      ...emptySite,
      articles: [ref("standalone", { url: "standalone", synopsis: "Solo" })],
      groups: [
        {
          slug: "series",
          title: "Series",
          articles: [ref("part-1", { url: "part-1", synopsis: "Part one" })],
        },
      ],
    };
    const result = treeToSiteData(buildTreeFromSite(site));
    expect(result.articles).toEqual(site.articles);
    expect(result.groups).toEqual(site.groups);
  });
});
