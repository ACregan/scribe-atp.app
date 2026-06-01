import { describe, it, expect } from "vitest";
import { SLUG_RE, DOMAIN_RE, ARTICLE_COLLECTION, SITE_COLLECTION } from "./constants";

describe("ARTICLE_COLLECTION", () => {
  it("is the correct AT Protocol collection identifier", () => {
    expect(ARTICLE_COLLECTION).toBe("app.scribe.article");
  });
});

describe("SITE_COLLECTION", () => {
  it("is the correct AT Protocol collection identifier", () => {
    expect(SITE_COLLECTION).toBe("app.scribe.site");
  });
});

describe("SLUG_RE", () => {
  describe("valid slugs", () => {
    it.each([
      "hello",
      "hello-world",
      "my-article-title",
      "article123",
      "123",
      "a1b2-c3d4",
    ])("accepts '%s'", (slug) => {
      expect(SLUG_RE.test(slug)).toBe(true);
    });
  });

  describe("invalid slugs", () => {
    it.each([
      ["empty string", ""],
      ["uppercase letters", "Hello"],
      ["spaces", "hello world"],
      ["leading hyphen", "-hello"],
      ["trailing hyphen", "hello-"],
      ["consecutive hyphens", "hello--world"],
      ["underscore", "hello_world"],
      ["special characters", "hello!world"],
      ["dot", "hello.world"],
    ])("rejects %s ('%s')", (_label, slug) => {
      expect(SLUG_RE.test(slug)).toBe(false);
    });
  });
});

describe("DOMAIN_RE", () => {
  describe("valid domains", () => {
    it.each([
      "example.com",
      "my-blog.com",
      "sub.example.org",
      "my-blog.co.uk",
      "example123.io",
      "norobots.blog",
    ])("accepts '%s'", (domain) => {
      expect(DOMAIN_RE.test(domain)).toBe(true);
    });
  });

  describe("invalid domains", () => {
    it.each([
      ["empty string", ""],
      ["no TLD", "localhost"],
      ["starts with dot", ".example.com"],
      ["ends with dot", "example.com."],
      ["spaces", "my blog.com"],
      ["single-char TLD", "example.c"],
    ])("rejects %s ('%s')", (_label, domain) => {
      expect(DOMAIN_RE.test(domain)).toBe(false);
    });
  });
});
