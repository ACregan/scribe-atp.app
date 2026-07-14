import { describe, it, expect } from "vitest";
import DOMPurify from "isomorphic-dompurify";
import {
  validateArticleFields,
  buildLooseSiteUrl,
  buildLooseDocumentFields,
  parseContributors,
  sanitizeArticleHtml,
  buildArticleRef,
} from "./article.server";

const DID = "did:plc:e2lcgwxhymx3q6u7blziecdr";

describe("buildArticleRef", () => {
  const baseFields = {
    uri: `at://${DID}/site.standard.document/abc123`,
    title: "My Article",
    slug: "my-article",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("bug fix: mirrors bskyPostRef when provided", () => {
    const ref = buildArticleRef({
      ...baseFields,
      bskyPostRef: { uri: "at://did/app.bsky.feed.post/xyz", cid: "post-cid" },
    });
    expect(ref.bskyPostRef).toEqual({
      uri: "at://did/app.bsky.feed.post/xyz",
      cid: "post-cid",
    });
  });

  it("omits bskyPostRef when not provided", () => {
    const ref = buildArticleRef(baseFields);
    expect(ref.bskyPostRef).toBeUndefined();
  });

  it("mirrors contributors when provided", () => {
    const ref = buildArticleRef({
      ...baseFields,
      contributors: [{ did: "did:plc:writer", role: "Writer" }],
    });
    expect(ref.contributors).toEqual([
      { did: "did:plc:writer", role: "Writer" },
    ]);
  });
});

describe("validateArticleFields", () => {
  it("requires a title", () => {
    expect(validateArticleFields("", "my-slug")).toBe("Title is required.");
  });

  it("requires a slug", () => {
    expect(validateArticleFields("Title", "")).toBe("URL slug is required.");
  });

  it("rejects an invalid slug", () => {
    expect(validateArticleFields("Title", "Not A Slug")).toMatch(/lowercase letters/);
  });

  it("accepts valid fields with no splash image", () => {
    expect(validateArticleFields("Title", "my-slug")).toBeNull();
  });

  it("rejects a non-https splash image URL", () => {
    expect(validateArticleFields("Title", "my-slug", "http://example.com/x.jpg")).toMatch(
      /https/,
    );
  });
});

describe("buildLooseSiteUrl", () => {
  it("builds a reader URL from the DID and document rkey", () => {
    expect(buildLooseSiteUrl(DID, "3mp47vxbfg226")).toBe(
      `https://reader.scribe-atp.app/${DID}/site.standard.document/3mp47vxbfg226`,
    );
  });
});

describe("buildLooseDocumentFields", () => {
  it("sets site to the loose reader URL", () => {
    const result = buildLooseDocumentFields(DID, "rkey1", "/some-slug", {});
    expect(result.site).toBe(buildLooseSiteUrl(DID, "rkey1"));
  });

  it("derives path from the last segment of the current path, dropping any group prefix", () => {
    const result = buildLooseDocumentFields(DID, "rkey1", "/engineering/my-article", {});
    expect(result.path).toBe("/my-article");
  });

  it("falls back to the rkey when the current path has no usable segment", () => {
    const result = buildLooseDocumentFields(DID, "rkey1", "", {});
    expect(result.path).toBe("/rkey1");
  });

  it("strips domain and canonicalUrl from scribe while preserving other fields", () => {
    const result = buildLooseDocumentFields(DID, "rkey1", "/x", {
      domain: "norobots.blog",
      canonicalUrl: "https://norobots.blog/x",
      createdAt: "2026-01-01T00:00:00Z",
      coverImageUrl: "https://example.com/img.webp",
    });
    expect(result.scribe).toEqual({
      createdAt: "2026-01-01T00:00:00Z",
      coverImageUrl: "https://example.com/img.webp",
    });
  });

  it("handles an already-empty scribe object", () => {
    const result = buildLooseDocumentFields(DID, "rkey1", "/x", {});
    expect(result.scribe).toEqual({});
  });
});

describe("parseContributors", () => {
  function formDataWith(...values: string[]): FormData {
    const fd = new FormData();
    values.forEach((v) => fd.append("contributors", v));
    return fd;
  }

  it("returns an empty array with no error when no contributors are submitted", () => {
    const result = parseContributors(new FormData());
    expect(result).toEqual({ contributors: [], error: null });
  });

  it("parses well-formed contributor JSON values", () => {
    const result = parseContributors(
      formDataWith(
        JSON.stringify({
          did: "did:plc:abc",
          role: "Editor",
          displayName: "A Contributor",
        }),
      ),
    );
    expect(result).toEqual({
      contributors: [
        { did: "did:plc:abc", role: "Editor", displayName: "A Contributor" },
      ],
      error: null,
    });
  });

  it("parses multiple contributors", () => {
    const result = parseContributors(
      formDataWith(
        JSON.stringify({ did: "did:plc:a", role: "Editor", displayName: "A" }),
        JSON.stringify({ did: "did:plc:b", role: "Writer", displayName: "B" }),
      ),
    );
    expect(result.error).toBeNull();
    expect(result.contributors).toHaveLength(2);
  });

  it("rejects a value that isn't valid JSON, instead of throwing", () => {
    const result = parseContributors(formDataWith("not json"));
    expect(result).toEqual({ contributors: [], error: "Invalid contributor data." });
  });

  it("rejects a well-formed object missing did", () => {
    const result = parseContributors(
      formDataWith(JSON.stringify({ role: "Editor", displayName: "A" })),
    );
    expect(result.error).toBe("Invalid contributor data.");
  });

  it("rejects a well-formed object missing role", () => {
    const result = parseContributors(
      formDataWith(JSON.stringify({ did: "did:plc:abc", displayName: "A" })),
    );
    expect(result.error).toBe("Invalid contributor data.");
  });

  it("rejects a well-formed object missing displayName", () => {
    const result = parseContributors(
      formDataWith(JSON.stringify({ did: "did:plc:abc", role: "Editor" })),
    );
    expect(result.error).toBe("Invalid contributor data.");
  });

  it("rejects an empty-string did", () => {
    const result = parseContributors(
      formDataWith(JSON.stringify({ did: "  ", role: "Editor", displayName: "A" })),
    );
    expect(result.error).toBe("Invalid contributor data.");
  });

  it("rejects a JSON array or primitive instead of an object", () => {
    const result = parseContributors(formDataWith(JSON.stringify(["not", "an", "object"])));
    expect(result.error).toBe("Invalid contributor data.");
  });
});

describe("sanitizeArticleHtml", () => {
  it("returns empty/falsy input unchanged", () => {
    expect(sanitizeArticleHtml("")).toBe("");
  });

  it("strips a CSS-Modules class emitted by Lexical's exportDOM", () => {
    const result = sanitizeArticleHtml('<h1 class="_h1_v8vhs_415">Title</h1>');
    expect(result).not.toContain("_h1_v8vhs_415");
    expect(result).toContain("<h1>Title</h1>");
  });

  it("strips CSS-Modules classes from bold/italic/link/list/blockquote/code elements", () => {
    const html = [
      '<p><strong class="_bold_v8vhs_375">bold</strong></p>',
      '<p><a class="_link_v8vhs_345" href="https://example.com">link</a></p>',
      '<ul class="_ul_v8vhs_470"><li class="_listItem_v8vhs_480">item</li></ul>',
      '<blockquote class="_blockquote_v8vhs_446">quote</blockquote>',
      '<pre class="_codeBlock_v8vhs_454"><code>x</code></pre>',
    ].join("");
    const result = sanitizeArticleHtml(html);
    expect(result).not.toMatch(/class="[^"]*_[a-z]+_[a-z0-9]+_\d+/);
  });

  it("keeps Prism token classes required by @scribe-atp/styles", () => {
    const html =
      '<pre class="_codeBlock_v8vhs_454"><code><span class="token keyword">const</span></code></pre>';
    const result = sanitizeArticleHtml(html);
    expect(result).toContain('class="token keyword"');
    expect(result).not.toContain("_codeBlock_v8vhs_454");
  });

  it("drops the class attribute entirely when nothing survives the allowlist", () => {
    const result = sanitizeArticleHtml('<h2 class="_h2_v8vhs_420">Heading</h2>');
    expect(result).not.toContain("class=");
  });

  it("does not leak its class-filtering hook into unrelated DOMPurify calls", () => {
    sanitizeArticleHtml('<p class="_bold_v8vhs_375">x</p>');
    // A plain, unrelated DOMPurify.sanitize call (mirroring view.tsx's
    // read-time XSS sanitisation) must not have the hook still attached —
    // otherwise a live-editor CSS-Modules class would survive on read too,
    // while any *other* class an author might legitimately want preserved
    // would get silently stripped.
    const result = DOMPurify.sanitize('<p class="some-class">x</p>', {
      FORCE_BODY: true,
    });
    expect(result).toContain('class="some-class"');
  });
});
