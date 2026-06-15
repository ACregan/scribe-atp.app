import { Agent } from "@atproto/api";
import { ARTICLE_COLLECTION, SITE_COLLECTION, SLUG_RE, IMAGE_URL_RE } from "~/constants";
import type { SiteOption } from "~/components/types";
import type { ArticleRef } from "~/hooks/types";
import {
  addArticleToSites,
  computeSiteAssignmentChanges,
  syncSiteArticleRefs,
} from "~/services/articleSiteSync.server";

export function validateArticleFields(
  title: string,
  url: string,
  splashImageUrl?: string,
): string | null {
  if (!title?.trim()) return "Title is required.";
  if (!url?.trim()) return "URL slug is required.";
  if (!SLUG_RE.test(url))
    return "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).";
  if (splashImageUrl?.trim() && !IMAGE_URL_RE.test(splashImageUrl.trim()))
    return "Splash Image URL must start with https://.";
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

export type UpdateArticleResult = {
  newCid?: string;
  newSlug?: string;
};

export async function createArticle(
  agent: Agent,
  did: string,
  fields: {
    title: string;
    content: string;
    url: string;
    splashImageUrl: string;
    synopsis: string;
  },
  siteRkeys: string[],
): Promise<{ uri: string }> {
  const now = new Date().toISOString();
  const result = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey: fields.url,
    record: buildArticleRecord({
      title: fields.title,
      content: fields.content,
      url: fields.url,
      splashImageUrl: fields.splashImageUrl,
      synopsis: fields.synopsis,
      createdAt: now,
      updatedAt: now,
    }),
  });
  if (siteRkeys.length > 0) {
    const ref = buildArticleRef({
      uri: result.data.uri,
      title: fields.title,
      url: fields.url,
      splashImageUrl: fields.splashImageUrl,
      synopsis: fields.synopsis,
      createdAt: now,
      updatedAt: now,
    });
    await addArticleToSites(agent, did, siteRkeys, ref);
  }
  return { uri: result.data.uri };
}

export async function updateArticle(
  agent: Agent,
  did: string,
  params: {
    oldRkey: string;
    fields: {
      title: string;
      content: string;
      url: string;
      splashImageUrl: string;
      synopsis: string;
      createdAt: string;
    };
    cid: string | null;
    oldSiteRkeys: string[];
    newSiteRkeys: string[];
  },
): Promise<UpdateArticleResult> {
  const { oldRkey, fields, cid, oldSiteRkeys, newSiteRkeys } = params;
  const slugChanged = fields.url !== oldRkey;
  const now = new Date().toISOString();
  const record = buildArticleRecord({ ...fields, updatedAt: now });
  const oldArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${oldRkey}`;
  const newArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${fields.url}`;
  const ref = buildArticleRef({
    uri: newArticleUri,
    title: fields.title,
    url: fields.url,
    splashImageUrl: fields.splashImageUrl,
    synopsis: fields.synopsis,
    createdAt: fields.createdAt,
    updatedAt: now,
  });
  const siteChanges = computeSiteAssignmentChanges(oldSiteRkeys, newSiteRkeys);

  if (slugChanged) {
    await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey: fields.url,
      record,
    });
    await agent.com.atproto.repo
      .deleteRecord({
        repo: did,
        collection: ARTICLE_COLLECTION,
        rkey: oldRkey,
        swapRecord: cid ?? undefined,
      })
      .catch((err) => {
        console.error("Failed to delete old record after rename:", err);
      });
    await syncSiteArticleRefs(agent, did, siteChanges, oldArticleUri, ref);
    return { newSlug: fields.url };
  }

  const putResult = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey: oldRkey,
    record,
    swapRecord: cid ?? undefined,
  });
  await syncSiteArticleRefs(agent, did, siteChanges, oldArticleUri, ref);
  return { newCid: putResult.data.cid };
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

