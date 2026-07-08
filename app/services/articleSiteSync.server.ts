import { Agent } from "@atproto/api";
import { SITE_COLLECTION } from "~/constants";
import type { SiteRecordValue } from "~/routes/article/site-list/siteTree";

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
