import { Agent } from "@atproto/api";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import { pendingSubmissions } from "~/services/db.server";
import { buildArticleRef } from "~/services/article.server";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import { buildDocumentPathAndUrl } from "~/services/siteManifest.server";
import { putDocument } from "~/services/documentRepository.server";
import { fetchBskyProfile } from "~/services/blueskyProfile.server";
import { parseSiteUri, resolveDidPdsUrl } from "~/services/pdsResolution.server";
import type { ArticleRef } from "~/hooks/types";

// Phase 3 sub-pass 2 (ADR 0022) — the Owner-side half of reviewing a
// Contributor's submission. Deliberately NOT an extension of
// publishArticleToGroup: that function's largest piece of work is a
// same-repo document read-and-write-back, which is categorically
// impossible here — AT Protocol has no cross-repo write, so the Owner's
// session can never touch the Contributor's document (that's what makes
// sub-pass 3c, the Contributor's own finalizing write, necessary at all).

export type SubmissionDocument = {
  title: string;
  content: string;
  description: string;
  splashImageUrl: string;
  tags: string[];
  createdAt: string;
};

function parseDocumentValue(value: Record<string, unknown>): SubmissionDocument {
  const scribe = (value.scribe as Record<string, unknown>) ?? {};
  const rawContent = value.content;
  const content =
    typeof rawContent === "object" &&
    rawContent !== null &&
    (rawContent as Record<string, unknown>).$type === "app.scribe.content.html"
      ? String((rawContent as Record<string, unknown>).html ?? "")
      : String(rawContent ?? "");

  return {
    title: String(value.title ?? "Untitled"),
    content,
    description: String(value.description ?? ""),
    splashImageUrl: String(scribe.coverImageUrl ?? ""),
    tags: Array.isArray(value.tags) ? (value.tags as string[]) : [],
    createdAt: String(scribe.createdAt ?? ""),
  };
}

// Public, unauthenticated read — site.standard.document records are
// publicly readable, and the Owner reviewing a submission is never the
// Contributor whose repo holds it, so no agent call can serve this (same
// cross-repo constraint pdsResolution.server.ts's header comment explains).
async function getPublicDocument(
  contributorDid: string,
  rkey: string,
): Promise<Record<string, unknown> | null> {
  const pdsUrl = await resolveDidPdsUrl(contributorDid);
  const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", contributorDid);
  url.searchParams.set("collection", DOCUMENT_COLLECTION);
  url.searchParams.set("rkey", rkey);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { value: Record<string, unknown> };
  return data.value;
}

// Public, unauthenticated read of a site.standard.publication record —
// used by the Contributor-side reconciliation check (ADR 0023 point 2) to
// look for the submitted document's URI in the Owner's manifest. Same
// shape as getPublicDocument, different collection. Exported for list.tsx's
// classification fix (ADR 0023's Consequences — a document published to a
// site the caller doesn't own needs this same cross-repo read to correctly
// show under Site-Assigned Articles instead of Standalone).
export async function getPublicSiteRecord(
  ownerDid: string,
  siteRkey: string,
): Promise<Record<string, unknown> | null> {
  const pdsUrl = await resolveDidPdsUrl(ownerDid);
  const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", ownerDid);
  url.searchParams.set("collection", SITE_COLLECTION);
  url.searchParams.set("rkey", siteRkey);
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { value: Record<string, unknown> };
  return data.value;
}

// Found live 2026-07-19: a Contributor's read-only view of someone else's
// site (site-list.tsx) links View at a human-readable slug, not the rkey —
// so unlike getPublicDocument above (which needs an already-known rkey),
// this has to paginate a public listRecords and match by slug, same as
// view.tsx/edit.tsx's own caller's-own-repo scan. Used when the article's
// real owner (encoded in its own at:// uri, threaded through as a query
// param by ArticleItem) differs from the caller — i.e. this is someone
// else's article, so the caller's own repo can never have it.
export async function getPublicDocumentBySlug(
  ownerDid: string,
  slug: string,
): Promise<{ uri: string; cid: string; value: Record<string, unknown> } | null> {
  const pdsUrl = await resolveDidPdsUrl(ownerDid);
  let cursor: string | undefined;
  do {
    const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set("repo", ownerDid);
    url.searchParams.set("collection", DOCUMENT_COLLECTION);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>;
      cursor?: string;
    };
    const found = data.records.find(
      (r) => String(r.value.path ?? "").split("/").pop() === slug,
    );
    if (found) return found;
    cursor = data.cursor;
  } while (cursor);
  return null;
}

export type ReviewableSubmission = {
  documentUri: string;
  contributorDid: string;
  siteUri: string;
  ownerDid: string;
  submittedAt: string;
  document: SubmissionDocument;
};

// Loader-facing lookup — does NOT check who's asking. The review route's
// own loader is responsible for the ownerDid === caller's own did guard
// (ADR 0022 point 1), same as any other route's own authorization check.
export async function getSubmissionForReview(
  contributorDid: string,
  rkey: string,
): Promise<ReviewableSubmission | null> {
  const documentUri = `at://${contributorDid}/${DOCUMENT_COLLECTION}/${rkey}`;
  const submission = pendingSubmissions.get(documentUri);
  if (!submission || submission.status !== "pending") return null;

  const value = await getPublicDocument(contributorDid, rkey);
  if (!value) return null;

  return {
    documentUri,
    contributorDid,
    siteUri: submission.siteUri,
    ownerDid: submission.ownerDid,
    submittedAt: submission.submittedAt,
    document: parseDocumentValue(value),
  };
}

// Re-checks the pending_submissions row itself at the start (ADR 0022 point
// 5) rather than trusting a value the caller already had in hand — guards a
// double-click or a submission left open in two tabs from inserting a
// duplicate ArticleRef.
export async function approveSubmission(
  agent: Agent,
  ownerDid: string,
  documentUri: string,
  groupSlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const submission = pendingSubmissions.get(documentUri);
  if (!submission || submission.status !== "pending") {
    return { ok: false, error: "This submission has already been reviewed." };
  }

  const { ownerDid: contributorDid, rkey } = parseSiteUri(documentUri);
  const value = await getPublicDocument(contributorDid, rkey);
  if (!value) {
    return { ok: false, error: "Could not read the submitted article." };
  }

  const { rkey: siteRkey } = parseSiteUri(submission.siteUri);
  const scribe = (value.scribe as Record<string, unknown>) ?? {};
  const slug =
    String(value.path ?? "")
      .split("/")
      .filter(Boolean)
      .pop() || rkey;
  const publishedAt = new Date().toISOString();

  const ref: ArticleRef = buildArticleRef({
    uri: documentUri,
    title: String(value.title ?? "Untitled"),
    slug,
    splashImageUrl: scribe.coverImageUrl ? String(scribe.coverImageUrl) : undefined,
    description: value.description ? String(value.description) : undefined,
    tags: Array.isArray(value.tags) ? (value.tags as string[]) : undefined,
    contributors: Array.isArray(value.contributors)
      ? (value.contributors as ArticleRef["contributors"])
      : undefined,
    bskyPostRef: value.bskyPostRef as ArticleRef["bskyPostRef"],
    createdAt: String(scribe.createdAt ?? publishedAt),
    publishedAt,
    updatedAt: publishedAt,
  });

  try {
    await mutateSiteRecord(agent, ownerDid, siteRkey, (val) => {
      const groupExists = (val.groups ?? []).some((g) => g.slug === groupSlug);
      if (!groupExists) {
        throw new Error(`Group "${groupSlug}" not found on this site.`);
      }
      return {
        ...val,
        groups: (val.groups ?? []).map((g) =>
          g.slug === groupSlug ? { ...g, articles: [ref, ...g.articles] } : g,
        ),
        updatedAt: publishedAt,
      };
    });
  } catch (err) {
    return { ok: false, error: `Failed to approve submission: ${String(err)}` };
  }

  pendingSubmissions.remove(documentUri);
  return { ok: true };
}

export function rejectSubmission(
  documentUri: string,
  reason: string,
): { ok: true } | { ok: false; error: string } {
  const submission = pendingSubmissions.get(documentUri);
  if (!submission || submission.status !== "pending") {
    return { ok: false, error: "This submission has already been reviewed." };
  }
  if (!reason.trim()) {
    return { ok: false, error: "A reason is required to reject a submission." };
  }

  pendingSubmissions.reject(documentUri, reason.trim());
  return { ok: true };
}

// Phase 3 sub-pass 3 (ADR 0023) — the Contributor-side counterpart to
// approveSubmission/rejectSubmission above. Runs from the Contributor's own
// /article/list loader, over documents that still carry
// scribe.pendingPublish. Returns the document's updated `value` when
// something was resolved (approved or rejected) so the caller can patch its
// own in-memory copy without a second fetch; returns null for a genuine
// no-op (nothing decided yet, or still ambiguous).
function clearPendingPublishScribe(
  scribe: Record<string, unknown>,
): Record<string, unknown> {
  const { pendingPublish: _drop, ...rest } = scribe;
  return rest;
}

// Phase 4 (discovery UX polish) — the outcome is reported back so list.tsx's
// loader can surface a Contributor-side toast. This needs no dedup of its
// own the way the Owner-side new-submission toast does (ADR 0023's
// sessionStorage note doesn't apply here): the reconciliation itself is
// self-consuming — once a document transitions, the triggering condition
// (a pending or rejected local row) is gone, so a later visit can never
// detect the same transition twice.
export type ReconciliationResult =
  | {
      outcome: "rejected";
      value: Record<string, unknown>;
      siteUri: string;
      rejectionReason: string;
    }
  | {
      outcome: "approved";
      value: Record<string, unknown>;
      siteUri: string;
      siteTitle: string;
    };

export async function reconcilePendingSubmission(
  agent: Agent,
  contributorDid: string,
  record: { rkey: string; uri: string; cid: string; value: Record<string, unknown> },
): Promise<ReconciliationResult | null> {
  const scribe = (record.value.scribe as Record<string, unknown>) ?? {};
  const pendingPublish = scribe.pendingPublish as { siteUri?: string } | undefined;
  if (!pendingPublish?.siteUri) return null;

  const submission = pendingSubmissions.get(record.uri);

  // Row still pending — nothing decided yet, no network call needed.
  if (submission?.status === "pending") return null;

  // Rejected — the local row IS the entire signal (a rejection leaves no
  // public artifact on the Owner's site), no cross-repo read needed.
  if (submission?.status === "rejected") {
    const newValue = {
      ...record.value,
      scribe: clearPendingPublishScribe(scribe),
    };
    await putDocument(agent, contributorDid, record.rkey, newValue, record.cid);
    pendingSubmissions.remove(record.uri);
    return {
      outcome: "rejected",
      value: newValue,
      siteUri: pendingPublish.siteUri,
      rejectionReason: submission.rejectionReason ?? "",
    };
  }

  // Row missing — ambiguous between "approved" (approveSubmission already
  // deleted it) and "lost" (an accepted gap, ADR 0015's Consequences). Only
  // this branch needs the cross-repo read, to disambiguate.
  const { ownerDid, rkey: siteRkey } = parseSiteUri(pendingPublish.siteUri);
  const siteValue = await getPublicSiteRecord(ownerDid, siteRkey);
  if (!siteValue) return null;

  const siteScribe = (siteValue.scribe as Record<string, unknown>) ?? {};
  const groups =
    (siteScribe.groups as Array<{
      slug: string;
      articles: Array<{ uri: string }>;
    }>) ?? [];
  const matchedGroup = groups.find((g) =>
    (g.articles ?? []).some((a) => a.uri === record.uri),
  );
  if (!matchedGroup) return null; // not found anywhere — can't tell, no-op

  // Approved — the one finalizing write only the Contributor's own session
  // can make (ADR 0014 point 3).
  const domain = String(siteScribe.domain ?? "");
  const basePath = String(siteScribe.basePath ?? "");
  const siteTitle = String(siteScribe.title ?? "");
  const slug =
    String(record.value.path ?? "")
      .split("/")
      .filter(Boolean)
      .pop() || record.rkey;
  const { path, canonicalUrl } = buildDocumentPathAndUrl(
    domain,
    basePath,
    matchedGroup.slug,
    slug,
  );
  const publishedAt = new Date().toISOString();

  const ownerProfile = await fetchBskyProfile(ownerDid);
  const ownerDisplayName =
    ownerProfile?.displayName || ownerProfile?.handle || ownerDid;
  const existingContributors = (record.value.contributors ??
    []) as ArticleRef["contributors"];
  const contributors = (existingContributors ?? []).some((c) => c.did === ownerDid)
    ? existingContributors
    : [
        ...(existingContributors ?? []),
        { did: ownerDid, role: "Publisher", displayName: ownerDisplayName },
      ];

  const newValue = {
    ...record.value,
    site: pendingPublish.siteUri,
    path,
    publishedAt,
    contributors,
    scribe: {
      ...clearPendingPublishScribe(scribe),
      domain,
      canonicalUrl,
    },
  };

  await putDocument(agent, contributorDid, record.rkey, newValue, record.cid);
  return {
    outcome: "approved",
    value: newValue,
    siteUri: pendingPublish.siteUri,
    siteTitle,
  };
}
