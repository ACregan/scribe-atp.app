import { Agent } from "@atproto/api";
import { DOCUMENT_COLLECTION } from "~/constants";
import { pendingSubmissions } from "~/services/db.server";
import { buildArticleRef } from "~/services/article.server";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
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
