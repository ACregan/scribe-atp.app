import { describe, it, expect, vi, afterEach } from "vitest";
import { slugFromUri, flattenArticles } from "./utils";
import type { Site, ArticleRef } from "./types";

// ─── slugFromUri ──────────────────────────────────────────────────────────────

describe("slugFromUri", () => {
  it("returns the final path segment of an AT URI", () => {
    expect(slugFromUri("at://did:plc:abc/site.standard.document/my-post")).toBe("my-post");
  });

  it("works for any URI depth", () => {
    expect(slugFromUri("at://did/collection/rkey")).toBe("rkey");
  });

  it("works when the slug contains hyphens and numbers", () => {
    expect(slugFromUri("at://did/col/hello-world-123")).toBe("hello-world-123");
  });
});

// ─── flattenArticles ─────────────────────────────────────────────────────────

const articleRef = (slug: string, overrides: Partial<ArticleRef> = {}): ArticleRef => ({
  uri: `at://did/site.standard.document/${slug}`,
  title: `Article: ${slug}`,
  splashImageUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const baseSite: Site = {
  title: "My Site",
  url: "example.com",
  urlPrefix: "blog",
  groups: [],
  ungroupedArticles: [],
};

describe("flattenArticles", () => {
  it("returns an empty array when there are no groups or articles", () => {
    expect(flattenArticles(baseSite)).toEqual([]);
  });

  it("returns ungrouped articles when there are no groups", () => {
    const site: Site = {
      ...baseSite,
      ungroupedArticles: [articleRef("post-a"), articleRef("post-b")],
    };
    expect(flattenArticles(site)).toEqual(site.ungroupedArticles);
  });

  it("returns group articles before ungrouped articles", () => {
    const grouped = articleRef("grouped-post");
    const ungrouped = articleRef("ungrouped-post");
    const site: Site = {
      ...baseSite,
      groups: [{ slug: "eng", title: "Engineering", articles: [grouped] }],
      ungroupedArticles: [ungrouped],
    };
    const result = flattenArticles(site);
    expect(result[0].uri).toBe(grouped.uri);
    expect(result[1].uri).toBe(ungrouped.uri);
  });

  it("flattens articles from multiple groups in order", () => {
    const a = articleRef("a");
    const b = articleRef("b");
    const c = articleRef("c");
    const site: Site = {
      ...baseSite,
      groups: [
        { slug: "g1", title: "Group 1", articles: [a] },
        { slug: "g2", title: "Group 2", articles: [b, c] },
      ],
    };
    const result = flattenArticles(site);
    expect(result.map((r) => r.uri)).toEqual([a.uri, b.uri, c.uri]);
  });

  it("includes all articles from groups and ungrouped in the total count", () => {
    const site: Site = {
      ...baseSite,
      groups: [
        { slug: "g1", title: "Group 1", articles: [articleRef("a"), articleRef("b")] },
      ],
      ungroupedArticles: [articleRef("c")],
    };
    expect(flattenArticles(site)).toHaveLength(3);
  });
});

// ─── resolveIdentifier ────────────────────────────────────────────────────────

describe("resolveIdentifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a DID unchanged without making a network request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { resolveIdentifier } = await import("./utils");
    const result = await resolveIdentifier("did:plc:abc123");
    expect(result).toBe("did:plc:abc123");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a handle to a DID via the public API", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ did: "did:plc:resolved123" }),
    } as Response);
    const { resolveIdentifier } = await import("./utils");
    const result = await resolveIdentifier("user.bsky.social");
    expect(result).toBe("did:plc:resolved123");
  });

  it("passes the encoded handle in the request URL", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ did: "did:plc:x" }),
    } as Response);
    const { resolveIdentifier } = await import("./utils");
    await resolveIdentifier("user.bsky.social");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("handle=user.bsky.social"),
    );
  });

  it("throws when the API returns a non-ok response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      statusText: "Not Found",
    } as Response);
    const { resolveIdentifier } = await import("./utils");
    await expect(resolveIdentifier("unknown.handle")).rejects.toThrow(
      'Could not resolve handle "unknown.handle"',
    );
  });
});
