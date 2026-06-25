import { Agent } from "@atproto/api";
import { SITE_COLLECTION } from "~/constants";
import type { ArticleRef } from "~/hooks/types";
import {
  removeArticleRef,
  updateArticleRef,
  type SiteRecordValue,
} from "~/routes/article/site-list/siteTree";

export type SiteAssignmentChanges = {
  sitesToAdd: string[];
  sitesToRemove: string[];
  sitesToSync: string[];
};

/**
 * Pure function — partitions site rkey lists into the three categories needed
 * when an article is saved. sitesToSync covers both slug-rename and metadata-only
 * saves; both call updateArticleRef with the same arguments.
 */
export function computeSiteAssignmentChanges(
  oldRkeys: string[],
  newRkeys: string[],
): SiteAssignmentChanges {
  return {
    sitesToAdd: newRkeys.filter((r) => !oldRkeys.includes(r)),
    sitesToRemove: oldRkeys.filter((r) => !newRkeys.includes(r)),
    sitesToSync: oldRkeys.filter((r) => newRkeys.includes(r)),
  };
}

/**
 * Fetch → transform → write-back pattern used by every site record mutation.
 * Preserves unknown fields via SiteRecordValue's Record<string, unknown> spread.
 */
export async function mutateSiteRecord(
  agent: Agent,
  did: string,
  siteRkey: string,
  mutate: (record: SiteRecordValue) => SiteRecordValue,
): Promise<void> {
  const rec = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey: siteRkey,
  });
  const pubRecord = rec.data.value as Record<string, unknown>;
  const mutatedScribe = mutate(pubRecord.scribe as SiteRecordValue);
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey: siteRkey,
    record: { ...pubRecord, scribe: mutatedScribe },
    swapRecord: rec.data.cid,
  });
}

export async function addArticleToSites(
  agent: Agent,
  did: string,
  siteRkeys: string[],
  articleRef: ArticleRef,
): Promise<void> {
  await Promise.allSettled(
    siteRkeys.map((siteRkey) =>
      mutateSiteRecord(agent, did, siteRkey, (record) => ({
        ...record,
        ungroupedArticles: [...(record.ungroupedArticles ?? []), articleRef],
        updatedAt: new Date().toISOString(),
      })),
    ),
  );
}

export async function findSitesContaining(
  agent: Agent,
  did: string,
  articleUri: string,
): Promise<string[]> {
  const result = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });
  return result.data.records
    .filter((record) => (record.value as Record<string, unknown>).scribe != null)
    .filter((record) => {
      const scribe = ((record.value as Record<string, unknown>).scribe ?? {}) as SiteRecordValue;
      const inTopLevel = (scribe.ungroupedArticles ?? []).some(
        (a) => a.uri === articleUri,
      );
      const inGroups = (scribe.groups ?? []).some((g) =>
        (g.articles ?? []).some((a) => a.uri === articleUri),
      );
      return inTopLevel || inGroups;
    })
    .map((record) => record.uri.split("/").pop()!);
}

/**
 * Applies all site ArticleRef changes arising from an article edit.
 * Phase 1 (parallel): remove from unassigned sites, update ref in retained sites.
 * Phase 2 (parallel): append ref to newly assigned sites.
 */
export async function syncSiteArticleRefs(
  agent: Agent,
  did: string,
  changes: SiteAssignmentChanges,
  oldArticleUri: string,
  newArticleRef: ArticleRef,
): Promise<void> {
  await Promise.allSettled([
    ...changes.sitesToRemove.map((rkey) =>
      mutateSiteRecord(agent, did, rkey, (record) =>
        removeArticleRef(record, oldArticleUri),
      ),
    ),
    ...changes.sitesToSync.map((rkey) =>
      mutateSiteRecord(agent, did, rkey, (record) =>
        updateArticleRef(record, oldArticleUri, newArticleRef),
      ),
    ),
  ]);
  await addArticleToSites(agent, did, changes.sitesToAdd, newArticleRef);
}
