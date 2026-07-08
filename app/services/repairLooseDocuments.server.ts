import {
  buildDocLocationMap,
  fetchAllDocuments,
  fetchAllSites,
} from "~/services/repairDocumentPaths.server";

// Business logic for the /devtools/repair-loose-documents tool — Phase 1 of
// ADR 0013 (docs/adr/0013-document-site-field-is-the-loose-vs-published-signal.md).
//
// No current UI path (button or drag-and-drop) fully "un-leaks" a document
// once it's removed from every site's manifest — confirmed against live
// production data: `site` is never touched by any existing code path, and
// `publishedAt`/`scribe.canonicalUrl`/`scribe.domain` are cleared
// inconsistently depending on which action last touched the record. This
// tool normalizes all four fields unconditionally for every document that
// is not currently referenced by any site's `groups` or `ungroupedArticles`.

export const READER_BASE_URL = "https://reader.scribe-atp.app";
export const DOCUMENT_COLLECTION_NAME = "site.standard.document";

export function buildLooseSiteUrl(did: string, rkey: string): string {
  return `${READER_BASE_URL}/${did}/${DOCUMENT_COLLECTION_NAME}/${rkey}`;
}

export type LooseDocumentRepairItem = {
  rkey: string;
  title: string;
  currentSite: string;
  newSite: string;
  currentPath: string;
  newPath: string;
  hadPublishedAt: boolean;
  hadCanonicalUrl: boolean;
  hadScribeDomain: boolean;
};

export type LooseRepairPlan = {
  toRepair: LooseDocumentRepairItem[];
  alreadyLoose: number;
  stillAssigned: number;
  skippedNonScribe: number;
};

function hasScribeExtension(value: Record<string, unknown>): boolean {
  const scribe = value.scribe;
  return scribe != null && typeof scribe === "object";
}

export function buildLoosePlan(
  documents: Array<{ uri: string; cid: string; value: unknown }>,
  locationMap: Map<string, unknown[]>,
  did: string,
): LooseRepairPlan {
  const toRepair: LooseDocumentRepairItem[] = [];
  let alreadyLoose = 0;
  let stillAssigned = 0;
  let skippedNonScribe = 0;

  for (const doc of documents) {
    const rkey = doc.uri.split("/").pop()!;
    const v = doc.value as Record<string, unknown>;

    // This DID may host site.standard.document records from other
    // site.standard-compliant apps sharing the same account — only touch
    // Scribe's own records (identified by the presence of a `scribe`
    // extension object).
    if (!hasScribeExtension(v)) {
      skippedNonScribe++;
      continue;
    }

    const locations = locationMap.get(rkey);
    if (locations && locations.length > 0) {
      // Still referenced by at least one site's manifest — not loose, and
      // this tool never touches an actively-assigned document.
      stillAssigned++;
      continue;
    }

    const title = String(v.title ?? "Untitled");
    const currentSite = String(v.site ?? "");
    const currentPath = String(v.path ?? "");
    const scribe = (v.scribe as Record<string, unknown>) ?? {};

    const newSite = buildLooseSiteUrl(did, rkey);
    const slug = currentPath.split("/").filter(Boolean).pop() || rkey;
    const newPath = `/${slug}`;

    const hadPublishedAt = v.publishedAt != null && v.publishedAt !== "";
    const hadCanonicalUrl = scribe.canonicalUrl != null && scribe.canonicalUrl !== "";
    const hadScribeDomain = scribe.domain != null && scribe.domain !== "";

    const alreadyCorrect =
      currentSite === newSite &&
      currentPath === newPath &&
      !hadPublishedAt &&
      !hadCanonicalUrl &&
      !hadScribeDomain;

    if (alreadyCorrect) {
      alreadyLoose++;
      continue;
    }

    toRepair.push({
      rkey,
      title,
      currentSite,
      newSite,
      currentPath,
      newPath,
      hadPublishedAt,
      hadCanonicalUrl,
      hadScribeDomain,
    });
  }

  return { toRepair, alreadyLoose, stillAssigned, skippedNonScribe };
}

// Re-exported so the route file has a single import source for everything
// this tool needs — fetchAllDocuments/fetchAllSites/buildDocLocationMap are
// shared with the repair-document-paths tool rather than duplicated.
export { buildDocLocationMap, fetchAllDocuments, fetchAllSites };
