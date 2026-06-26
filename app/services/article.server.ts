import { Agent } from "@atproto/api";
import { SITE_COLLECTION, SLUG_RE, IMAGE_URL_RE } from "~/constants";
import type { SiteOption } from "~/components/types";
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

export async function loadSiteOptions(
  agent: Agent,
  did: string,
): Promise<SiteOption[]> {
  const result = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });
  return result.data.records
    .filter((record) => (record.value as Record<string, unknown>).scribe != null)
    .map((record) => {
    const scribe = ((record.value as Record<string, unknown>).scribe as Record<string, unknown>) ?? {};
    return {
      rkey: record.uri.split("/").pop()!,
      title: String(scribe.title ?? ""),
      url: String(scribe.domain ?? ""),
    };
  });
}
