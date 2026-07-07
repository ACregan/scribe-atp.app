import { Agent } from "@atproto/api";
import {
  findSitesContaining,
  mutateSiteRecord,
} from "~/services/articleSiteSync.server";
import { resolveThumbUrl } from "~/services/article.server";
import { logger } from "~/services/logger.server";
import {
  toSlug,
  removeArticleRef,
  updateArticleRef,
} from "~/routes/article/site-list/siteTree";
import type {
  SiteManifest,
  SiteRecordValue,
} from "~/routes/article/site-list/siteTree";
import type { ArticleRef, SiteGroup } from "~/hooks/types";
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

// Composes a document's site-relative `path` and fully-qualified
// `canonicalUrl` from the owning site's domain/basePath plus group/slug
// segments. Single source of truth for both fields — basePath must be
// baked into `path` itself, not just canonicalUrl, since consumer sites
// compose links as `publication.url + document.path` with no separate
// urlPrefix step (see the 2026-07-07 incident: three call sites each built
// path without basePath, producing broken referrer links).
export function buildDocumentPathAndUrl(
  domain: string,
  basePath: string,
  ...segments: string[]
): { path: string; canonicalUrl: string } {
  const path = basePath
    ? `/${basePath}/${segments.join("/")}`
    : `/${segments.join("/")}`;
  return { path, canonicalUrl: `https://${domain}${path}` };
}

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

// Pure — given the group each published article was in before the save, plus
// the new tree and domain/basePath, computes which documents need a
// path/canonicalUrl rewrite. Covers both group->group moves and
// group->ungrouped moves. needsPublishedAt is true when an article is moving
// from ungroupedArticles into a named group for the first time. Whether a
// candidate's path has *actually* changed can only be known after fetching the
// document, so that check stays in the I/O wrapper below.
export function computeDocumentPathUpdates(
  oldGroupByUri: Map<string, string>,
  groups: SiteGroup[],
  ungroupedArticles: ArticleRef[],
  domain: string,
  basePath: string,
): Array<{
  rkey: string;
  newPath: string;
  newCanonicalUrl: string;
  needsPublishedAt: boolean;
}> {
  const groupMoves = groups.flatMap((g) =>
    (g.articles ?? [])
      .filter(
        (a) =>
          a.uri.includes(`/${DOCUMENT_COLLECTION}/`) &&
          oldGroupByUri.get(a.uri) !== g.slug,
      )
      .map((a) => {
        const rkey = a.uri.split("/").pop()!;
        const { path: newPath, canonicalUrl: newCanonicalUrl } =
          buildDocumentPathAndUrl(domain, basePath, g.slug, a.slug ?? rkey);
        return {
          rkey,
          newPath,
          newCanonicalUrl,
          needsPublishedAt: !oldGroupByUri.has(a.uri),
        };
      }),
  );

  const ungroupedMoves = ungroupedArticles
    .filter(
      (a) =>
        a.uri.includes(`/${DOCUMENT_COLLECTION}/`) && oldGroupByUri.has(a.uri),
    )
    .map((a) => {
      const rkey = a.uri.split("/").pop()!;
      // Drafts have no group segment and no live reader route — leave path
      // basePath-less here too, matching how create.tsx seeds a new draft.
      const { path: newPath, canonicalUrl: newCanonicalUrl } =
        buildDocumentPathAndUrl(domain, "", a.slug ?? rkey);
      return {
        rkey,
        newPath,
        newCanonicalUrl,
        needsPublishedAt: false,
      };
    });

  return [...groupMoves, ...ungroupedMoves];
}

export async function saveSiteOrder(
  agent: Agent,
  did: string,
  siteSlug: string,
  data: { groups: SiteGroup[]; ungroupedArticles: ArticleRef[] },
): Promise<{ ok: true } | { error: string }> {
  const { groups, ungroupedArticles } = data;
  try {
    let domain = "";
    let basePath = "";
    const oldGroupByUri = new Map<string, string>();
    const now = new Date().toISOString();

    // Overwrite the manifest; capture the pre-save domain/basePath/group
    // membership from the old record as a side effect of the mutate callback.
    // Articles dragged from ungroupedArticles into a named group are being
    // published for the first time — stamp publishedAt on their ArticleRefs
    // here so the manifest stays consistent with the document record update below.
    await mutateSiteRecord(agent, did, siteSlug, (record) => {
      domain = String(record.domain ?? "");
      basePath = String(record.basePath ?? "");
      for (const g of record.groups ?? []) {
        for (const a of g.articles ?? []) {
          if (a.uri.includes(`/${DOCUMENT_COLLECTION}/`)) {
            oldGroupByUri.set(a.uri, g.slug);
          }
        }
      }
      const fixedGroups = groups.map((g) => ({
        ...g,
        articles: (g.articles ?? []).map((a) =>
          !oldGroupByUri.has(a.uri)
            ? { ...a, publishedAt: now, updatedAt: now }
            : a,
        ),
      }));
      return {
        ...record,
        groups: fixedGroups as SiteRecordValue["groups"],
        ungroupedArticles,
        updatedAt: now,
      };
    });

    const updates = computeDocumentPathUpdates(
      oldGroupByUri,
      groups,
      ungroupedArticles,
      domain,
      basePath,
    );
    const results = await Promise.allSettled(
      updates.map(async ({ rkey, newPath, newCanonicalUrl, needsPublishedAt }) => {
        const { data: docData } = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
        });
        const docVal = docData.value as Record<string, unknown>;
        if (docVal.path === newPath && !needsPublishedAt) return;
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
          record: {
            ...docVal,
            path: newPath,
            ...(needsPublishedAt ? { publishedAt: now } : {}),
            scribe: {
              ...((docVal.scribe as Record<string, unknown>) ?? {}),
              canonicalUrl: newCanonicalUrl,
            },
            updatedAt: now,
          },
          swapRecord: docData.cid,
        });
      }),
    );
    const failures = results.filter((r) => r.status === "rejected").length;
    if (failures > 0) {
      return { error: `${failures} article path(s) failed to update.` };
    }
  } catch (err) {
    console.error("Failed to save site:", err);
    return { error: `Failed to save order: ${String(err)}` };
  }
  return { ok: true };
}

// Fetches the thumb Variant (falling back to the original URL) and uploads it
// as a blob. Non-fatal by design — any failure is logged and swallowed so the
// caller can proceed without a cover image. Shared by publishArticleToGroup;
// shareToBluesky (fast-follow) will use this too instead of duplicating it.
async function uploadCoverImageBlob(
  agent: Agent,
  coverImageUrl: string,
): Promise<unknown | undefined> {
  try {
    const thumbSrc = resolveThumbUrl(coverImageUrl);
    let imgRes = await fetch(thumbSrc);
    if (!imgRes.ok && thumbSrc !== coverImageUrl) {
      imgRes = await fetch(coverImageUrl);
    }
    if (imgRes.ok) {
      const imgBuffer = await imgRes.arrayBuffer();
      const mimeType = imgRes.headers.get("content-type") ?? "image/webp";
      const uploadRes = await agent.uploadBlob(new Uint8Array(imgBuffer), {
        encoding: mimeType,
      });
      return uploadRes.data.blob;
    }
  } catch (blobErr) {
    logger.warn(
      {
        event: "article.publish.cover_image_blob_error",
        error: String(blobErr),
      },
      "cover image blob upload error — publish will proceed without coverImage",
    );
  }
  return undefined;
}

export async function publishArticleToGroup(
  agent: Agent,
  did: string,
  siteSlug: string,
  params: {
    uri: string;
    groupSlug: string;
    canonicalSiteRkey: string;
    siteAssignments: Array<{ rkey: string; domain: string; basePath: string }>;
  },
): Promise<
  | {
      ok: true;
      uri: string;
      groupSlug: string;
      warning?: string;
      notification: {
        publicationUri: string;
        siteTitle: string;
        articleTitle: string;
        canonicalUrl: string;
      } | null;
    }
  | { ok: false; error: string }
> {
  const { uri, groupSlug, canonicalSiteRkey, siteAssignments } = params;
  let secondaryFailures = 0;

  try {
    const rkey = uri.split("/").pop()!;
    const publishedAt = new Date().toISOString();

    // Fetch the existing document and site manifest in parallel
    const [docResult, siteResult] = await Promise.all([
      agent.com.atproto.repo.getRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey,
      }),
      agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
      }),
    ]);

    const doc = docResult.data.value as Record<string, unknown>;
    const pubRecord = siteResult.data.value as Record<string, unknown>;
    const scribeExt = (pubRecord.scribe as Record<string, unknown>) ?? {};

    // Derive slug from current document path
    const slug =
      String(doc.path ?? "")
        .split("/")
        .pop() || rkey;

    const siteAtUri = `at://${did}/${SITE_COLLECTION}/${canonicalSiteRkey}`;
    const canonicalAssignment = siteAssignments.find(
      (s) => s.rkey === canonicalSiteRkey,
    ) ?? {
      rkey: canonicalSiteRkey,
      domain: String(scribeExt.domain ?? ""),
      basePath: String(scribeExt.basePath ?? ""),
    };
    const { path: docPath, canonicalUrl } = buildDocumentPathAndUrl(
      canonicalAssignment.domain,
      canonicalAssignment.basePath,
      groupSlug,
      slug,
    );

    const publishNotification = {
      publicationUri: `at://${did}/${SITE_COLLECTION}/${siteSlug}`,
      siteTitle: String(scribeExt.title ?? ""),
      articleTitle: String(doc.title ?? ""),
      canonicalUrl,
    };

    // Upload cover image blob (non-fatal)
    const docScribe = (doc.scribe as Record<string, unknown>) ?? {};
    const docCoverImageUrl = String(
      docScribe.coverImageUrl ??
        docScribe.splashImageUrl ??
        doc.splashImageUrl ??
        "",
    );
    const coverImageBlobRef = docCoverImageUrl
      ? await uploadCoverImageBlob(agent, docCoverImageUrl)
      : undefined;

    const docTags = Array.isArray(doc.tags)
      ? (doc.tags as string[])
      : undefined;

    // Update the existing document (same TID rkey) with published fields
    await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      rkey,
      record: {
        ...doc,
        $type: DOCUMENT_COLLECTION,
        ...(coverImageBlobRef !== undefined
          ? { coverImage: coverImageBlobRef }
          : {}),
        path: docPath,
        site: siteAtUri,
        publishedAt,
        updatedAt: publishedAt,
        scribe: {
          ...((doc.scribe as Record<string, unknown>) ?? {}),
          coverImageUrl: docCoverImageUrl || undefined,
          canonicalUrl,
        },
      },
      swapRecord: docResult.data.cid,
    });

    const updatedRef: ArticleRef = {
      uri,
      title: String(doc.title ?? ""),
      slug,
      splashImageUrl: doc.splashImageUrl ? String(doc.splashImageUrl) : null,
      description: doc.description ? String(doc.description) : null,
      tags: docTags,
      createdAt: String(doc.createdAt ?? publishedAt),
      publishedAt,
      updatedAt: publishedAt,
    };

    // Current site: move from ungroupedArticles -> named group (URI unchanged)
    await mutateSiteRecord(agent, did, siteSlug, (val) => {
      const existing = (val.ungroupedArticles ?? []).find((a) => a.uri === uri);
      const ref = existing ? { ...existing, ...updatedRef } : updatedRef;
      return {
        ...val,
        ungroupedArticles: (val.ungroupedArticles ?? []).filter(
          (a) => a.uri !== uri,
        ),
        groups: (val.groups ?? []).map((g) =>
          g.slug === groupSlug ? { ...g, articles: [...g.articles, ref] } : g,
        ),
        updatedAt: publishedAt,
      };
    });

    // Other sites: refresh cached ref fields in-place (URI unchanged)
    const otherSiteRkeys = (await findSitesContaining(agent, did, uri)).filter(
      (r) => r !== siteSlug,
    );
    if (otherSiteRkeys.length > 0) {
      const refResults = await Promise.allSettled(
        otherSiteRkeys.map((rk) =>
          mutateSiteRecord(agent, did, rk, (val) =>
            updateArticleRef(val, uri, updatedRef),
          ),
        ),
      );
      secondaryFailures = refResults.filter(
        (r) => r.status === "rejected",
      ).length;
      if (secondaryFailures > 0) {
        logger.warn(
          {
            event: "article.publish.ref_update_error",
            user_did: did,
            uri,
            failed: secondaryFailures,
          },
          "secondary site ref updates failed",
        );
      }
    }

    return {
      ok: true,
      uri,
      groupSlug,
      ...(secondaryFailures > 0
        ? {
            warning: `Article published, but ${secondaryFailures} linked site(s) could not be updated.`,
          }
        : {}),
      notification: publishNotification,
    };
  } catch (err) {
    console.error("Failed to publish article:", err);
    // Bug fix: include an error message — the frontend's toast effect checks
    // `else if (data.error)` on failure, which previously could never fire
    // since this returned bare { ok: false }.
    return { ok: false, error: `Failed to publish article: ${String(err)}` };
  }
}
