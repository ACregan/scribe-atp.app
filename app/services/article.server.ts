import { Agent } from "@atproto/api";
import { ARTICLE_COLLECTION, SITE_COLLECTION, SLUG_RE, IMAGE_URL_RE } from "~/constants";
import type { SiteOption } from "~/components/types";
import type { ArticleRef } from "~/hooks/types";
import {
  addArticleToSites,
  computeSiteAssignmentChanges,
  syncSiteArticleRefs,
} from "~/services/articleSiteSync.server";
import { logger } from "~/services/logger.server";

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

export function buildArticleRecord(fields: {
  title: string;
  content: string;
  slug: string;
  splashImageUrl?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}): Record<string, unknown> {
  return {
    $type: ARTICLE_COLLECTION,
    title: fields.title,
    path: `/${fields.slug}`,
    content: { $type: "app.scribe.content.html", html: fields.content },
    splashImageUrl: fields.splashImageUrl?.trim() || undefined,
    description: fields.description?.trim() || undefined,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
}

export function buildArticleRef(fields: {
  uri: string;
  title: string;
  slug: string;
  splashImageUrl?: string;
  description?: string;
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
    publishedAt: fields.publishedAt,
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
    slug: string;
    splashImageUrl: string;
    description: string;
  },
  siteRkeys: string[],
): Promise<{ uri: string }> {
  const now = new Date().toISOString();
  const result = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey: fields.slug,
    record: buildArticleRecord({
      title: fields.title,
      content: fields.content,
      slug: fields.slug,
      splashImageUrl: fields.splashImageUrl,
      description: fields.description,
      createdAt: now,
      updatedAt: now,
    }),
  });
  if (siteRkeys.length > 0) {
    const ref = buildArticleRef({
      uri: result.data.uri,
      title: fields.title,
      slug: fields.slug,
      splashImageUrl: fields.splashImageUrl,
      description: fields.description,
      createdAt: now,
      updatedAt: now,
    });
    await addArticleToSites(agent, did, siteRkeys, ref);
  }
  logger.info({ event: "article.create", user_did: did, rkey: fields.slug, site_count: siteRkeys.length }, "article.create");
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
      slug: string;
      splashImageUrl: string;
      description: string;
      createdAt: string;
    };
    cid: string | null;
    oldSiteRkeys: string[];
    newSiteRkeys: string[];
  },
): Promise<UpdateArticleResult> {
  const { oldRkey, fields, cid, oldSiteRkeys, newSiteRkeys } = params;
  const slugChanged = fields.slug !== oldRkey;
  const now = new Date().toISOString();
  const record = buildArticleRecord({ ...fields, updatedAt: now });
  const oldArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${oldRkey}`;
  const newArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${fields.slug}`;
  const ref = buildArticleRef({
    uri: newArticleUri,
    title: fields.title,
    slug: fields.slug,
    splashImageUrl: fields.splashImageUrl,
    description: fields.description,
    createdAt: fields.createdAt,
    updatedAt: now,
  });
  const siteChanges = computeSiteAssignmentChanges(oldSiteRkeys, newSiteRkeys);

  if (slugChanged) {
    await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey: fields.slug,
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
    logger.info({ event: "article.update", user_did: did, rkey: fields.slug, old_rkey: oldRkey, slug_renamed: true }, "article.update");
    return { newSlug: fields.slug };
  }

  const putResult = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey: oldRkey,
    record,
    swapRecord: cid ?? undefined,
  });
  await syncSiteArticleRefs(agent, did, siteChanges, oldArticleUri, ref);
  logger.info({ event: "article.update", user_did: did, rkey: oldRkey, slug_renamed: false }, "article.update");
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
