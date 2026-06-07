import { Agent } from "@atproto/api";
import { ARTICLE_COLLECTION, SITE_COLLECTION, SLUG_RE } from "~/constants";
import type { SiteOption } from "~/components/types";
import {
  type SiteArticleRef,
  type SiteRecordValue,
} from "~/routes/article/site-list/siteTree";

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
}): SiteArticleRef {
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

export async function addArticleToSites(
  agent: Agent,
  did: string,
  siteRkeys: string[],
  articleRef: SiteArticleRef,
): Promise<void> {
  await Promise.allSettled(
    siteRkeys.map(async (siteRkey) => {
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
      });
      const siteValue = rec.data.value as SiteRecordValue;
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: {
          ...siteValue,
          articles: [...(siteValue.articles ?? []), articleRef],
          updatedAt: new Date().toISOString(),
        },
        swapRecord: rec.data.cid,
      });
    }),
  );
}
