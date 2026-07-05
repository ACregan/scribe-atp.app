import { Agent } from "@atproto/api";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import { toSlug } from "~/routes/article/site-list/siteTree";
import type { SiteManifest } from "~/routes/article/site-list/siteTree";
import { SITE_COLLECTION, SLUG_RE } from "~/constants";

// Business logic for site-manifest mutations (groups, article placement,
// publish/draft transitions) extracted from the site-list route's action.
// Sibling to articleSiteSync.server.ts, which owns the shared fetch->transform
// ->write-back primitives (mutateSiteRecord, findSitesContaining).
//
// Not to be confused with the `SiteManifest` type in
// app/routes/article/site-list/siteTree.ts (the loader's normalized read-side
// shape) — these functions operate on ArticleRef/SiteGroup DTOs and the raw
// SiteRecordValue, never SiteManifest.

// Pure — no I/O
export function validateGroupFields(
  title: string,
  slugInput?: string,
): { slug: string } | { error: string } {
  const trimmedSlugInput = slugInput?.trim().toLowerCase();
  const slug = trimmedSlugInput || toSlug(title);
  if (!slug) {
    return { error: "Title must contain at least one letter or number." };
  }
  if (!SLUG_RE.test(slug)) {
    return {
      error: "URL path must be lowercase letters, numbers and hyphens only.",
    };
  }
  return { slug };
}

export async function createGroup(
  agent: Agent,
  did: string,
  siteSlug: string,
  fields: { title: string; slug: string },
): Promise<{ ok: true } | { error: string }> {
  try {
    const rec = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: SITE_COLLECTION,
      rkey: siteSlug,
    });
    const pubRecord = rec.data.value as Record<string, unknown>;
    const scribe = pubRecord.scribe as SiteManifest;
    if ((scribe.groups ?? []).some((g) => g.slug === fields.slug)) {
      return { error: "A group with this name already exists." };
    }
    await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: SITE_COLLECTION,
      rkey: siteSlug,
      record: {
        ...pubRecord,
        scribe: {
          ...scribe,
          groups: [
            ...(scribe.groups ?? []),
            { slug: fields.slug, title: fields.title, articles: [] },
          ],
          updatedAt: new Date().toISOString(),
        },
      },
      swapRecord: rec.data.cid,
    });
  } catch (err) {
    console.error("Failed to create group:", err);
    return { error: `Failed to create group: ${String(err)}` };
  }
  return { ok: true };
}

export async function deleteGroup(
  agent: Agent,
  did: string,
  siteSlug: string,
  groupSlug: string,
): Promise<{ ok: true; deletedSlug: string } | { ok: false; error: string }> {
  try {
    await mutateSiteRecord(agent, did, siteSlug, (val) => ({
      ...val,
      groups: (val.groups ?? []).filter((g) => g.slug !== groupSlug),
      updatedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error("Failed to delete group:", err);
    return { ok: false, error: `Failed to delete group: ${String(err)}` };
  }
  return { ok: true, deletedSlug: groupSlug };
}
