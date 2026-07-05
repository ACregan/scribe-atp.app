import { Agent } from "@atproto/api";
import { SITE_COLLECTION } from "~/constants";

// CRUD primitives for site.standard.publication records. Sibling to
// articleSiteSync.server.ts and siteManifest.server.ts, which build
// higher-level Site-manifest operations on top of primitives like these;
// existing callers (loadSiteOptions, findSitesContaining) are not required to
// migrate onto this module — new call sites should use it instead of
// hand-rolling agent.com.atproto.repo.* calls directly.

export type SiteRecord = {
  uri: string;
  cid: string;
  rkey: string;
  value: Record<string, unknown>;
};

export async function listSites(
  agent: Agent,
  did: string,
): Promise<SiteRecord[]> {
  const records: SiteRecord[] = [];
  let cursor: string | undefined;
  do {
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 100,
      cursor,
    });
    records.push(
      ...result.data.records.map((r) => ({
        uri: r.uri,
        cid: r.cid,
        rkey: r.uri.split("/").pop()!,
        value: r.value as Record<string, unknown>,
      })),
    );
    cursor = result.data.cursor;
  } while (cursor);
  return records;
}

export async function getSite(
  agent: Agent,
  did: string,
  rkey: string,
): Promise<{ cid: string | undefined; value: Record<string, unknown> }> {
  const result = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey,
  });
  return {
    cid: result.data.cid,
    value: result.data.value as Record<string, unknown>,
  };
}

export async function createSite(
  agent: Agent,
  did: string,
  rkey: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  const result = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey,
    record,
  });
  return { uri: result.data.uri, cid: result.data.cid };
}

export async function putSite(
  agent: Agent,
  did: string,
  rkey: string,
  record: Record<string, unknown>,
  swapRecord?: string,
): Promise<{ cid: string }> {
  const result = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey,
    record,
    swapRecord,
  });
  return { cid: result.data.cid };
}

export async function deleteSite(
  agent: Agent,
  did: string,
  rkey: string,
  swapRecord?: string,
): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey,
    swapRecord,
  });
}
