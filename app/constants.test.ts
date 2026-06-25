import { describe, it, expect } from "vitest";
import { SLUG_RE, DOMAIN_RE, IMAGE_URL_RE, ARTICLE_COLLECTION, SITE_COLLECTION } from "./constants";

describe("ARTICLE_COLLECTION", () => {
  it("is the correct AT Protocol collection identifier", () => {
    expect(ARTICLE_COLLECTION).toBe("app.scribe.article");
  });
});

describe("SITE_COLLECTION", () => {
  it("is the correct AT Protocol collection identifier", () => {
    expect(SITE_COLLECTION).toBe("site.standard.publication");
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

describe("IMAGE_URL_RE", () => {
  describe("valid image URLs", () => {
    it.each([
      "https://example.com/image.webp",
      "https://cdn.myblog.com/splash.jpg",
      "https://scribe-cms.app/image-storage/did/uuid/max.webp",
      "HTTPS://example.com/image.jpg",
    ])("accepts '%s'", (url) => {
      expect(IMAGE_URL_RE.test(url)).toBe(true);
    });
  });

  describe("invalid image URLs", () => {
    it.each([
      ["empty string", ""],
      ["http:// (not secure)", "http://example.com/image.jpg"],
      ["javascript: URI", "javascript:alert(1)"],
      ["data: URI", "data:image/png;base64,abc"],
      ["relative path", "/image-storage/image.webp"],
      ["protocol-relative", "//example.com/image.jpg"],
    ])("rejects %s ('%s')", (_label, url) => {
      expect(IMAGE_URL_RE.test(url)).toBe(false);
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
