import { type Agent } from "@atproto/api";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import { buildDocumentPathAndUrl } from "~/services/siteManifest.server";

// Business logic for the /devtools/repair-document-paths tool, extracted
// from the route file — route modules may only let `loader`/`action`/
// `middleware`/`headers` depend on server-only code; any other export
// (e.g. these pure helpers, needed directly by tests) breaks the
// react-router:dot-server client/server code-splitting build check.

export const STALE_RKEY = "alt-text-test";

export type DocumentRepairPlan = {
  rkey: string;
  title: string;
  currentPath: string;
  expectedPath: string;
  canonicalUrl: string;
  // The site the repair resolves as canonical — written back to the
  // document's own `site` field and scribe.domain every time a record is
  // repaired, so a stale/orphaned canonical pointer (see
  // [[urgent-article-path-basepath-bug]]) gets self-healed too, not just
  // path/canonicalUrl.
  canonicalSiteRkey: string;
  domain: string;
};

export type RepairPlan = {
  toRepair: DocumentRepairPlan[];
  toDelete: string[];
  alreadyCorrect: number;
  orphaned: number;
};

export function isTid(rkey: string): boolean {
  return /^[234567a-z]{13}$/.test(rkey);
}

export async function fetchAllDocuments(agent: Agent, did: string) {
  const records: Array<{ uri: string; cid: string; value: unknown }> = [];
  let cursor: string | undefined;
  do {
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      limit: 100,
      cursor,
    });
    records.push(...(result.data.records as typeof records));
    cursor = result.data.cursor;
  } while (cursor);
  return records;
}

export async function fetchAllSites(agent: Agent, did: string) {
  const records: Array<{ uri: string; cid: string; value: unknown }> = [];
  let cursor: string | undefined;
  do {
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 100,
      cursor,
    });
    records.push(...(result.data.records as typeof records));
    cursor = result.data.cursor;
  } while (cursor);
  return records;
}

type DocLocation = {
  siteRkey: string;
  slug: string;
  groupSlug: string | null;
  domain: string;
  basePath: string;
};

// A document can be cross-posted to more than one site (multi-select on
// create/edit), so this must collect every location a document appears in —
// not just the last one seen. A naive Map<rkey, DocLocation> here previously
// let whichever site was processed last silently win for every shared
// document, which could compute an "expected" path from the wrong site's
// basePath. See [[urgent-article-path-basepath-bug]] for the incident where
// this caused a real cross-posted article to be skipped as "already
// correct" — its wrong path happened to match the wrong site's formula.
export function buildDocLocationMap(
  sites: Array<{ uri: string; cid: string; value: unknown }>,
): Map<string, DocLocation[]> {
  const map = new Map<string, DocLocation[]>();

  function addLocation(tid: string, location: DocLocation) {
    if (!tid || !location.slug) return;
    const existing = map.get(tid) ?? [];
    existing.push(location);
    map.set(tid, existing);
  }

  for (const siteRecord of sites) {
    const siteRkey = siteRecord.uri.split("/").pop()!;
    const v = siteRecord.value as Record<string, unknown>;
    const scribe = (v.scribe as Record<string, unknown>) ?? {};
    const domain = String(scribe.domain ?? "");
    const basePath = String(scribe.basePath ?? "");
    if (!domain) continue;

    const groups = (scribe.groups as Array<Record<string, unknown>>) ?? [];
    const ungrouped =
      (scribe.ungroupedArticles as Array<Record<string, unknown>>) ?? [];

    for (const group of groups) {
      const groupSlug = String(group.slug ?? "");
      const articles =
        (group.articles as Array<Record<string, unknown>>) ?? [];
      for (const ref of articles) {
        const tid = String(ref.uri ?? "").split("/").pop()!;
        const slug = String(ref.slug ?? "");
        addLocation(tid, { siteRkey, slug, groupSlug, domain, basePath });
      }
    }

    for (const ref of ungrouped) {
      const tid = String(ref.uri ?? "").split("/").pop()!;
      const slug = String(ref.slug ?? "");
      addLocation(tid, { siteRkey, slug, groupSlug: null, domain, basePath });
    }
  }

  return map;
}

// Resolves which of a document's (possibly several, cross-posted) locations
// is canonical, using the document's own `site` field — the same source of
// truth publishArticleToGroup's canonicalSiteRkey param already respects.
//
// Falls back when `site` is missing/stale/doesn't match any manifest (a
// real, observed case — see [[urgent-article-path-basepath-bug]], "Code
// Assistants" incident: doc.site pointed at a site that didn't reference
// the article at all). The fallback prefers a *published* location
// (groupSlug set) over an unpublished draft one — picking the first
// location regardless of type once demoted a real, live published page
// below an unrelated draft placeholder on a different site.
export function resolveCanonicalLocation(
  docSiteUri: string,
  locations: DocLocation[],
): DocLocation | undefined {
  const canonicalSiteRkey = docSiteUri.split("/").pop() ?? "";
  const matched = locations.find((l) => l.siteRkey === canonicalSiteRkey);
  if (matched) return matched;
  const published = locations.find((l) => l.groupSlug !== null);
  return published ?? locations[0];
}

function docSiteRkey(doc: Record<string, unknown>): string {
  return String(doc.site ?? "").split("/").pop() ?? "";
}

export function buildPlan(
  documents: Array<{ uri: string; cid: string; value: unknown }>,
  locationMap: Map<string, DocLocation[]>,
): RepairPlan {
  const toRepair: DocumentRepairPlan[] = [];
  const toDelete: string[] = [];
  let alreadyCorrect = 0;
  let orphaned = 0;

  for (const doc of documents) {
    const rkey = doc.uri.split("/").pop()!;
    const v = doc.value as Record<string, unknown>;
    const title = String(v.title ?? "Untitled");
    const currentPath = String(v.path ?? "");

    if (rkey === STALE_RKEY) {
      toDelete.push(rkey);
      continue;
    }

    const locations = locationMap.get(rkey);
    const location =
      locations && locations.length > 0
        ? resolveCanonicalLocation(String(v.site ?? ""), locations)
        : undefined;

    if (!location) {
      // Draft — not in any manifest. Flag if path looks corrupted (ends with TID).
      const lastSegment = currentPath.split("/").pop() ?? "";
      if (isTid(lastSegment)) orphaned++;
      continue;
    }

    // Drafts (no groupSlug) have no live reader route — basePath-less,
    // matching computeDocumentPathUpdates' convention for ungrouped articles.
    const { path: expectedPath, canonicalUrl } = location.groupSlug
      ? buildDocumentPathAndUrl(
          location.domain,
          location.basePath,
          location.groupSlug,
          location.slug,
        )
      : buildDocumentPathAndUrl(location.domain, "", location.slug);

    const siteFieldMatches = docSiteRkey(v) === location.siteRkey;
    if (currentPath === expectedPath && siteFieldMatches) {
      alreadyCorrect++;
      continue;
    }

    toRepair.push({
      rkey,
      title,
      currentPath,
      expectedPath,
      canonicalUrl,
      canonicalSiteRkey: location.siteRkey,
      domain: location.domain,
    });
  }

  return { toRepair, toDelete, alreadyCorrect, orphaned };
}
