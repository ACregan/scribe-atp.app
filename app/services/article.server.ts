import { Agent } from "@atproto/api";
import { ARTICLE_COLLECTION, SITE_COLLECTION, SLUG_RE } from "~/constants";
import type { SiteOption } from "~/components/types";
import type { ArticleRef } from "~/hooks/types";

export function validateArticleFields(
  title: string,
  url: string,
): string | null {
  if (!title?.trim()) return "Title is required.";
  if (!url?.trim()) return "URL slug is required.";
  if (!SLUG_RE.test(url))
    return "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).";
  return null;
}

export function buildArticleRecord(fields: {
  title: string;
  content: string;
  url: string;
  splashImageUrl?: string;
  synopsis?: string;
  createdAt: string;
  updatedAt: string;
}): Record<string, unknown> {
  return {
    $type: ARTICLE_COLLECTION,
    title: fields.title,
    content: fields.content,
    url: fields.url,
    splashImageUrl: fields.splashImageUrl?.trim() || undefined,
    synopsis: fields.synopsis?.trim() || undefined,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
}

export function buildArticleRef(fields: {
  uri: string;
  title: string;
  url: string;
  splashImageUrl?: string;
  synopsis?: string;
  createdAt: string;
  updatedAt: string;
}): ArticleRef {
  return {
    uri: fields.uri,
    title: fields.title,
    url: fields.url,
    splashImageUrl: fields.splashImageUrl?.trim() || null,
    synopsis: fields.synopsis?.trim() || null,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
}

/** Strips HTML tags to check whether the editor actually contains text. */
export function hasTextContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim() !== "";
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
  return result.data.records.map((record) => ({
    rkey: record.uri.split("/").pop()!,
    title: String((record.value as Record<string, unknown>).title ?? ""),
    url: String((record.value as Record<string, unknown>).url ?? ""),
  }));
}

