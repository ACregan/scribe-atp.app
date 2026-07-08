import { describe, it, expect } from "vitest";
import {
  validateArticleFields,
  buildLooseSiteUrl,
  buildLooseDocumentFields,
} from "./article.server";

const DID = "did:plc:e2lcgwxhymx3q6u7blziecdr";

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
