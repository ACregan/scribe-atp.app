import {
  DOCUMENT_COLLECTION,
  READER_BASE_URL,
  SLUG_RE,
  IMAGE_URL_RE,
} from "~/constants";
import type { ArticleRef } from "~/hooks/types";

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
// shared by article creation (always loose), the unpublish action, and the
// one-off repair-loose-documents devtool, so all three can never drift from
// each other the way the pre-ADR-0013 code paths did.
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
    publishedAt: fields.publishedAt,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
}

