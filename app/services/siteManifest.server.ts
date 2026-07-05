import { Agent } from "@atproto/api";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import { toSlug, removeArticleRef } from "~/routes/article/site-list/siteTree";
import type { SiteManifest } from "~/routes/article/site-list/siteTree";
import type { ArticleRef } from "~/hooks/types";
import { DOCUMENT_COLLECTION, SITE_COLLECTION, SLUG_RE } from "~/constants";

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

// Route awaits, discards, and always redirects regardless of outcome —
// matches the existing "errors are logged, never surfaced" behaviour.
export async function removeArticleFromSite(
  agent: Agent,
  did: string,
  siteSlug: string,
  uri: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await mutateSiteRecord(agent, did, siteSlug, (val) =>
      removeArticleRef(val, uri),
    );
  } catch (err) {
    console.error("Failed to remove article:", err);
    return { ok: false, error: err };
  }
  return { ok: true };
}

// Same swallow-and-log contract as removeArticleFromSite.
export async function moveArticleToDraft(
  agent: Agent,
  did: string,
  siteSlug: string,
  uri: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const rkey = uri.split("/").pop()!;
    const now = new Date().toISOString();

    const docResult = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      rkey,
    });
    const doc = docResult.data.value as Record<string, unknown>;
    const slug =
      String(doc.path ?? "")
        .split("/")
        .pop() || rkey;

    // Move ref from named group -> ungroupedArticles (URI unchanged).
    // Bug fix: also drop any existing ungroupedArticles entry for this uri
    // before appending, so re-running this on an already-draft article
    // (previously only prevented by the UI hiding the button) can't
    // duplicate the ArticleRef.
    await mutateSiteRecord(agent, did, siteSlug, (val) => {
      let existingRef: ArticleRef | undefined;
      const newGroups = (val.groups ?? []).map((g) => {
        const found = g.articles.find((a) => a.uri === uri);
        if (found) existingRef = found;
        return { ...g, articles: g.articles.filter((a) => a.uri !== uri) };
      });
      const ref = existingRef ?? {
        uri,
        slug,
        title: String(doc.title ?? ""),
        splashImageUrl: doc.splashImageUrl ? String(doc.splashImageUrl) : null,
        description: doc.description ? String(doc.description) : null,
        createdAt: String(doc.createdAt ?? now),
        updatedAt: now,
      };
      return {
        ...val,
        groups: newGroups,
        ungroupedArticles: [
          ...(val.ungroupedArticles ?? []).filter((a) => a.uri !== uri),
          ref,
        ],
        updatedAt: now,
      };
    });

    // Reset document path to /{slug} and clear published-only fields
    const updatedDoc: Record<string, unknown> = { ...doc };
    updatedDoc.path = `/${slug}`;
    updatedDoc.updatedAt = now;
    delete updatedDoc.publishedAt;
    const updatedScribe = {
      ...((updatedDoc.scribe as Record<string, unknown>) ?? {}),
    };
    delete updatedScribe.canonicalUrl;
    updatedDoc.scribe = updatedScribe;
    await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      rkey,
      record: updatedDoc,
      swapRecord: docResult.data.cid,
    });
  } catch (err) {
    console.error("Failed to move article to draft:", err);
    return { ok: false, error: err };
  }
  return { ok: true };
}
