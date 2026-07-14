import DOMPurify from "isomorphic-dompurify";
import {
  DOCUMENT_COLLECTION,
  READER_BASE_URL,
  SLUG_RE,
  IMAGE_URL_RE,
} from "~/constants";
import type { ArticleRef } from "~/hooks/types";
import type { Contributor } from "~/components/types";

// Class names @scribe-atp/styles actually consumes — its Prism-based syntax
// highlighting CSS targets these (see scribe-atp-sdk's
// packages/styles/src/index.css, "Syntax highlighting" section). Every other
// class Lexical's exportDOM emits (headings, bold/italic, links, lists,
// blockquotes, code blocks — see RichTextEditor.tsx's `theme` object) comes
// straight out of RichTextEditor.module.css's CSS-Modules class map. Those
// hashes are meaningless outside the CMS's own build, and since CSS Modules
// rehashes them on every deploy, classes baked into a record today can go
// stale and permanently orphaned the next time the CMS ships a CSS change.
const ALLOWED_HTML_CLASSES = new Set([
  "token",
  "atrule",
  "attr",
  "boolean",
  "builtin",
  "cdata",
  "char",
  "class",
  "class-name",
  "comment",
  "constant",
  "deleted",
  "doctype",
  "entity",
  "function",
  "important",
  "inserted",
  "keyword",
  "namespace",
  "number",
  "operator",
  "prolog",
  "property",
  "punctuation",
  "regex",
  "selector",
  "string",
  "symbol",
  "tag",
  "url",
  "variable",
]);

// Strips every `class` token not in ALLOWED_HTML_CLASSES from article HTML
// before it's written to a site.standard.document record — the single choke
// point both create and edit actions save through. The hook is added and
// removed around this one synchronous call so it never leaks into the
// DOMPurify singleton's behaviour for other callers (e.g. view.tsx's
// read-time XSS sanitisation, which should keep classes exactly as stored).
export function sanitizeArticleHtml(html: string): string {
  if (!html) return html;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "class") return;
    data.attrValue = data.attrValue
      .split(/\s+/)
      .filter((token) => ALLOWED_HTML_CLASSES.has(token))
      .join(" ");
    if (!data.attrValue) data.keepAttr = false;
  });
  try {
    return DOMPurify.sanitize(html, { FORCE_BODY: true });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute");
  }
}

export function validateArticleFields(
  title: string,
  slug: string,
  splashImageUrl?: string,
): string | null {
  if (!title?.trim()) return "Title is required.";
  if (!slug?.trim()) return "URL slug is required.";
  if (!SLUG_RE.test(slug))
    return "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).";
  if (splashImageUrl?.trim() && !IMAGE_URL_RE.test(splashImageUrl.trim()))
    return "Splash Image URL must start with https://.";
  return null;
}

// Parses the `contributors` hidden-input values submitted from ArticleForm
// (one JSON-stringified Contributor per input). Guards against both a
// malformed value (invalid JSON) and a well-formed-but-wrong-shaped one
// (e.g. missing `did`) — either is reachable by any authenticated user
// editing the hidden form fields before submit, not just through the UI.
export function parseContributors(
  formData: FormData,
): { contributors: Contributor[]; error: string | null } {
  const raw = formData.getAll("contributors") as string[];
  const contributors: Contributor[] = [];
  for (const value of raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return { contributors: [], error: "Invalid contributor data." };
    }
    const candidate = parsed as Partial<Contributor> | null;
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.did !== "string" ||
      !candidate.did.trim() ||
      typeof candidate.role !== "string" ||
      !candidate.role.trim() ||
      typeof candidate.displayName !== "string" ||
      !candidate.displayName.trim()
    ) {
      return { contributors: [], error: "Invalid contributor data." };
    }
    contributors.push({
      did: candidate.did,
      role: candidate.role,
      displayName: candidate.displayName,
    });
  }
  return { contributors, error: null };
}

export function resolveThumbUrl(imageUrl: string): string {
  return imageUrl.replace(/\/(600|1200|1800|max)\.webp$/, "/thumb.webp");
}

// The spec's "loose document" signal (ADR 0013): `site` holds a plain
// https:// URL rather than an at:// publication URI. Reader renders any
// document by rkey regardless of state, so this is real and resolvable,
// not a placeholder.
export function buildLooseSiteUrl(did: string, rkey: string): string {
  return `${READER_BASE_URL}/${did}/${DOCUMENT_COLLECTION}/${rkey}`;
}

// Single source of truth for what "loose" means on a document record —
// shared by article creation (always loose) and the unpublish action, so
// the two can never drift from each other the way the pre-ADR-0013 code
// paths did.
export function buildLooseDocumentFields(
  did: string,
  rkey: string,
  currentPath: string,
  existingScribe: Record<string, unknown>,
): {
  site: string;
  path: string;
  scribe: Record<string, unknown>;
} {
  const slug = currentPath.split("/").filter(Boolean).pop() || rkey;
  const { domain: _domain, canonicalUrl: _canonicalUrl, ...restScribe } = existingScribe;
  return {
    site: buildLooseSiteUrl(did, rkey),
    path: `/${slug}`,
    scribe: restScribe,
  };
}

export function buildArticleRef(fields: {
  uri: string;
  title: string;
  slug: string;
  splashImageUrl?: string;
  description?: string;
  tags?: string[];
  contributors?: { did: string; role?: string; displayName?: string }[];
  bskyPostRef?: { uri: string; cid: string } | null;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}): ArticleRef {
  return {
    uri: fields.uri,
    title: fields.title,
    slug: fields.slug,
    splashImageUrl: fields.splashImageUrl?.trim() || null,
    description: fields.description?.trim() || null,
    tags: fields.tags?.length ? fields.tags : undefined,
    contributors: fields.contributors?.length ? fields.contributors : undefined,
    bskyPostRef: fields.bskyPostRef ?? undefined,
    publishedAt: fields.publishedAt,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
}

