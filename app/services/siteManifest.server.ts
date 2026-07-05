import { Agent } from "@atproto/api";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";

// Business logic for site-manifest mutations (groups, article placement,
// publish/draft transitions) extracted from the site-list route's action.
// Sibling to articleSiteSync.server.ts, which owns the shared fetch->transform
// ->write-back primitives (mutateSiteRecord, findSitesContaining).
//
// Not to be confused with the `SiteManifest` type in
// app/routes/article/site-list/siteTree.ts (the loader's normalized read-side
// shape) — these functions operate on ArticleRef/SiteGroup DTOs and the raw
// SiteRecordValue, never SiteManifest.

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
