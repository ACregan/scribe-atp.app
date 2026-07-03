import type { Route } from "./+types/site-list";
import {
  redirect,
  useFetcher,
  useBlocker,
  useNavigate,
  useLocation,
  Form,
  Link,
} from "react-router";
import {
  getAtpAgent,
  requireAuth,
  requireAtpAgent,
  useRealOAuth,
} from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Spinner } from "~/components/Spinner/Spinner";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import {
  ButtonGroupContainer,
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { ArticleItemPreview } from "~/components/ArticleItem/ArticleItem";
import GroupItem, {
  GroupItemPreview,
  type TreeArticle,
} from "~/components/GroupItem/GroupItem";
import GroupList from "~/components/GroupList/GroupList";
import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState, useRef, useEffect } from "react";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { useToast } from "~/components/Toast/ToastContext";

import { Select } from "~/components/Select/Select";
import {
  DOCUMENT_COLLECTION,
  SITE_COLLECTION,
  SLUG_RE,
} from "~/constants";
import type { ArticleRef, SiteGroup } from "~/hooks/types";
import {
  type SiteManifest,
  type SiteRecordValue,
  type TreeGroupNode,
  toSlug,
  treeToSiteData,
  removeArticleRef,
  updateArticleRef,
} from "./siteTree";
import { useDirtyTree } from "./useDirtyTree";
import { useSiteListDnD } from "./useSiteListDnD";
import {
  findSitesContaining,
  mutateSiteRecord,
} from "~/services/articleSiteSync.server";
import { resolveThumbUrl } from "~/services/article.server";
import { devSiteListLoader } from "~/services/devFixtures.server";
import { logger } from "~/services/logger.server";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

type SiteAssignment = {
  rkey: string;
  title: string;
  url: string;
  urlPrefix: string;
};

export function meta({ data }: Route.MetaArgs) {
  const title = data?.site?.title ?? "Site";
  return [{ title: `Scribe ATP – ${title}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const siteSlug = params.siteSlug;

  if (!useRealOAuth) return devSiteListLoader(siteSlug);

  try {
    const { agent, did } = await requireAtpAgent(request);
    const [record, allSitesResult] = await Promise.all([
      agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
      }),
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: SITE_COLLECTION,
        limit: 100,
      }),
    ]);

    const value = record.data.value as Record<string, unknown>;
    const scribeVal = (value.scribe as Record<string, unknown>) ?? {};

    // Map each ungrouped article URI to the list of sites it appears in
    const articleSiteMap = new Map<string, SiteAssignment[]>();
    for (const sr of allSitesResult.data.records.filter((r) => (r.value as Record<string, unknown>).scribe != null)) {
      const sv = sr.value as Record<string, unknown>;
      const scribe = (sv.scribe as Record<string, unknown>) ?? {};
      const srkey = sr.uri.split("/").pop()!;
      const entry: SiteAssignment = {
        rkey: srkey,
        title: String(scribe.title ?? ""),
        url: String(scribe.domain ?? ""),
        urlPrefix: String(scribe.basePath ?? ""),
      };
      for (const a of (scribe.ungroupedArticles as Array<{ uri: string }>) ?? []) {
        const list = articleSiteMap.get(a.uri) ?? [];
        list.push(entry);
        articleSiteMap.set(a.uri, list);
      }
    }

    const prefs = (value.preferences as Record<string, unknown>) ?? {};
    return {
      devMode: false,
      publicationUri: `at://${did}/${SITE_COLLECTION}/${siteSlug}`,
      notifySubscribersEnabled: prefs.notifySubscribersEnabled !== false,
      site: {
        rkey: siteSlug,
        cid: record.data.cid,
        url: String(scribeVal.domain ?? ""),
        title: String(scribeVal.title ?? ""),
        urlPrefix: String(scribeVal.basePath ?? ""),
        groups: (scribeVal.groups as SiteGroup[]) ?? [],
        ungroupedArticles: (scribeVal.ungroupedArticles as ArticleRef[]) ?? [],
      } as SiteManifest,
      articleSiteAssignments: Object.fromEntries(
        articleSiteMap,
      ) as Record<string, SiteAssignment[]>,
    };
  } catch {
    throw redirect("/sites");
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const siteSlug = params.siteSlug;
  const formData = await request.formData();
  const intent = formData.get("_intent") as string;

  if (intent === "createGroup") {
    const title = (formData.get("title") as string)?.trim();
    if (!title) return { error: "Group title is required." };
    const slugInput = (formData.get("slug") as string)?.trim().toLowerCase();
    const slug = slugInput || toSlug(title);
    if (!slug)
      return { error: "Title must contain at least one letter or number." };
    if (!SLUG_RE.test(slug))
      return {
        error: "URL path must be lowercase letters, numbers and hyphens only.",
      };

    if (useRealOAuth) {
      const agent = await getAtpAgent(did);
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
      });
      const pubRecord = rec.data.value as Record<string, unknown>;
      const scribe = pubRecord.scribe as SiteManifest;
      if ((scribe.groups ?? []).some((g) => g.slug === slug)) {
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
            groups: [...(scribe.groups ?? []), { slug, title, articles: [] }],
            updatedAt: new Date().toISOString(),
          },
        },
        swapRecord: rec.data.cid,
      });
    }

    return { ok: true };
  }

  if (intent === "deleteGroup") {
    const rkey = formData.get("rkey") as string;
    if (!rkey) return { ok: false, error: "Missing group ID." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        await mutateSiteRecord(agent, did, siteSlug, (val) => ({
          ...val,
          groups: (val.groups ?? []).filter((g) => g.slug !== rkey),
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.error("Failed to delete group:", err);
        return { ok: false, error: `Failed to delete group: ${String(err)}` };
      }
    }

    return { ok: true, deletedSlug: rkey };
  }

  if (intent === "saveSite") {
    const siteDataJson = formData.get("siteData") as string;
    if (!siteDataJson) return { error: "No data." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const { groups, ungroupedArticles } = JSON.parse(siteDataJson) as {
          groups: SiteGroup[];
          ungroupedArticles: ArticleRef[];
        };

        // GET current site once — used for CID swap and old group positions
        const currentSite = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
        });
        const currentPubRecord = currentSite.data.value as Record<string, unknown>;
        const currentScribeExt = (currentPubRecord.scribe as Record<string, unknown>) ?? {};
        const domain = String(currentScribeExt.domain ?? "");
        const basePath = String(currentScribeExt.basePath ?? "");
        const currentScribe = currentScribeExt as SiteRecordValue;

        // Track which group each published article was in before the save
        const oldGroupByUri = new Map<string, string>();
        for (const g of currentScribe.groups ?? []) {
          for (const a of g.articles ?? []) {
            if (a.uri.includes(`/${DOCUMENT_COLLECTION}/`)) {
              oldGroupByUri.set(a.uri, g.slug);
            }
          }
        }

        // Save the manifest
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
          record: {
            ...currentPubRecord,
            scribe: {
              ...currentScribe,
              groups: groups as SiteRecordValue["groups"],
              ungroupedArticles,
              updatedAt: new Date().toISOString(),
            },
          },
          swapRecord: currentSite.data.cid,
        });

        // Update path and canonicalUrl on published articles that moved between groups
        const pathUpdates = groups.flatMap((g) =>
          (g.articles ?? [])
            .filter(
              (a) =>
                a.uri.includes(`/${DOCUMENT_COLLECTION}/`) &&
                oldGroupByUri.get(a.uri) !== g.slug,
            )
            .map(async (a) => {
              const rkey = a.uri.split("/").pop()!;
              const slug = a.slug ?? rkey;
              const newPath = `/${g.slug}/${slug}`;
              const { data } = await agent.com.atproto.repo.getRecord({
                repo: did,
                collection: DOCUMENT_COLLECTION,
                rkey,
              });
              const docVal = data.value as Record<string, unknown>;
              if (docVal.path === newPath) return;
              const newCanonicalUrl = basePath
                ? `https://${domain}/${basePath}${newPath}`
                : `https://${domain}${newPath}`;
              await agent.com.atproto.repo.putRecord({
                repo: did,
                collection: DOCUMENT_COLLECTION,
                rkey,
                record: {
                  ...docVal,
                  path: newPath,
                  scribe: {
                    ...(docVal.scribe as Record<string, unknown> ?? {}),
                    canonicalUrl: newCanonicalUrl,
                  },
                  updatedAt: new Date().toISOString(),
                },
                swapRecord: data.cid,
              });
            }),
        );

        // Update path and canonicalUrl on documents moved to ungroupedArticles from a named group
        const ungroupedUpdates = ungroupedArticles
          .filter(
            (a) =>
              a.uri.includes(`/${DOCUMENT_COLLECTION}/`) &&
              oldGroupByUri.has(a.uri),
          )
          .map(async (a) => {
            const arkey = a.uri.split("/").pop()!;
            const aslug = a.slug ?? arkey;
            const newPath = `/${aslug}`;
            const { data } = await agent.com.atproto.repo.getRecord({
              repo: did,
              collection: DOCUMENT_COLLECTION,
              rkey: arkey,
            });
            const docVal = data.value as Record<string, unknown>;
            if (docVal.path === newPath) return;
            const newCanonicalUrl = basePath
              ? `https://${domain}/${basePath}${newPath}`
              : `https://${domain}${newPath}`;
            await agent.com.atproto.repo.putRecord({
              repo: did,
              collection: DOCUMENT_COLLECTION,
              rkey: arkey,
              record: {
                ...docVal,
                path: newPath,
                scribe: {
                  ...(docVal.scribe as Record<string, unknown> ?? {}),
                  canonicalUrl: newCanonicalUrl,
                },
                updatedAt: new Date().toISOString(),
              },
              swapRecord: data.cid,
            });
          });

        const saveResults = await Promise.allSettled([...pathUpdates, ...ungroupedUpdates]);
        const saveFailures = saveResults.filter(r => r.status === "rejected").length;
        if (saveFailures > 0) {
          return { error: `${saveFailures} article path(s) failed to update.` };
        }
      } catch (err) {
        console.error("Failed to save site:", err);
        return { error: `Failed to save order: ${String(err)}` };
      }
    }

    return { ok: true };
  }

  if (intent === "removeArticle") {
    const uri = formData.get("uri") as string;
    if (!uri) return redirect(`/article/list/${siteSlug}`);

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        await mutateSiteRecord(agent, did, siteSlug, (val) =>
          removeArticleRef(val, uri),
        );
      } catch (err) {
        console.error("Failed to remove article:", err);
      }
    }

    return redirect(`/article/list/${siteSlug}`);
  }

  if (intent === "moveToDraft") {
    const uri = formData.get("uri") as string;
    if (!uri) return redirect(`/article/list/${siteSlug}`);

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const rkey = uri.split("/").pop()!;
        const now = new Date().toISOString();

        const docResult = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
        });
        const doc = docResult.data.value as Record<string, unknown>;
        const slug = String(doc.path ?? "").split("/").pop() || rkey;

        // Move ref from named group → ungroupedArticles (URI unchanged)
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
            ungroupedArticles: [...(val.ungroupedArticles ?? []), ref],
            updatedAt: now,
          };
        });

        // Reset document path to /{slug} and clear published-only fields
        const updatedDoc: Record<string, unknown> = { ...doc };
        updatedDoc.path = `/${slug}`;
        updatedDoc.updatedAt = now;
        delete updatedDoc.publishedAt;
        const updatedScribe = { ...(updatedDoc.scribe as Record<string, unknown> ?? {}) };
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
      }
    }

    return redirect(`/article/list/${siteSlug}`);
  }

  if (intent === "publishArticle") {
    const uri = formData.get("uri") as string;
    const groupSlug = formData.get("groupSlug") as string;
    const canonicalSiteRkey = (formData.get("canonicalSiteRkey") as string) || siteSlug;
    const siteAssignmentsRaw = (formData.get("siteAssignments") as string) || "[]";
    const siteAssignments = JSON.parse(siteAssignmentsRaw) as Array<{
      rkey: string;
      domain: string;
      basePath: string;
    }>;
    if (!uri || !groupSlug) return { ok: false };

    let secondaryFailures = 0;
    let publishNotification: { publicationUri: string; siteTitle: string; articleTitle: string; canonicalUrl: string } | null = null;

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
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
        const slug = String(doc.path ?? "").split("/").pop() || rkey;

        const siteAtUri = `at://${did}/${SITE_COLLECTION}/${canonicalSiteRkey}`;
        const canonicalAssignment = siteAssignments.find(
          (s) => s.rkey === canonicalSiteRkey,
        ) ?? {
          rkey: canonicalSiteRkey,
          domain: String(scribeExt.domain ?? ""),
          basePath: String(scribeExt.basePath ?? ""),
        };
        const docPath = `/${groupSlug}/${slug}`;
        const canonicalUrl = canonicalAssignment.basePath
          ? `https://${canonicalAssignment.domain}/${canonicalAssignment.basePath}${docPath}`
          : `https://${canonicalAssignment.domain}${docPath}`;

        publishNotification = {
          publicationUri: `at://${did}/${SITE_COLLECTION}/${siteSlug}`,
          siteTitle: String(scribeExt.title ?? ""),
          articleTitle: String(doc.title ?? ""),
          canonicalUrl,
        };

        // Upload cover image blob (non-fatal)
        const docScribe = (doc.scribe as Record<string, unknown>) ?? {};
        const docCoverImageUrl = String(docScribe.coverImageUrl ?? docScribe.splashImageUrl ?? doc.splashImageUrl ?? "");
        let coverImageBlobRef: unknown;
        if (docCoverImageUrl) {
          try {
            const thumbSrc = resolveThumbUrl(docCoverImageUrl);
            let imgRes = await fetch(thumbSrc);
            if (!imgRes.ok && thumbSrc !== docCoverImageUrl) {
              imgRes = await fetch(docCoverImageUrl);
            }
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const mimeType = imgRes.headers.get("content-type") ?? "image/webp";
              const uploadRes = await agent.uploadBlob(new Uint8Array(imgBuffer), {
                encoding: mimeType,
              });
              coverImageBlobRef = uploadRes.data.blob;
            }
          } catch (blobErr) {
            logger.warn(
              { event: "article.publish.cover_image_blob_error", error: String(blobErr) },
              "cover image blob upload error — publish will proceed without coverImage",
            );
          }
        }

        const docTags = Array.isArray(doc.tags) ? (doc.tags as string[]) : undefined;

        // Update the existing document (same TID rkey) with published fields
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
          record: {
            ...doc,
            $type: DOCUMENT_COLLECTION,
            ...(coverImageBlobRef !== undefined ? { coverImage: coverImageBlobRef } : {}),
            path: docPath,
            site: siteAtUri,
            publishedAt,
            updatedAt: publishedAt,
            scribe: {
              ...(doc.scribe as Record<string, unknown> ?? {}),
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

        // Current site: move from ungroupedArticles → named group (URI unchanged)
        await mutateSiteRecord(agent, did, siteSlug, (val) => {
          const existing = (val.ungroupedArticles ?? []).find((a) => a.uri === uri);
          const ref = existing ? { ...existing, ...updatedRef } : updatedRef;
          return {
            ...val,
            ungroupedArticles: (val.ungroupedArticles ?? []).filter((a) => a.uri !== uri),
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
          secondaryFailures = refResults.filter((r) => r.status === "rejected").length;
          if (secondaryFailures > 0) {
            logger.warn(
              { event: "article.publish.ref_update_error", user_did: did, uri, failed: secondaryFailures },
              "secondary site ref updates failed",
            );
          }
        }
      } catch (err) {
        console.error("Failed to publish article:", err);
        return { ok: false };
      }
    }

    return {
      ok: true,
      uri,
      groupSlug,
      ...(secondaryFailures > 0
        ? { warning: `Article published, but ${secondaryFailures} linked site(s) could not be updated.` }
        : {}),
      notification: publishNotification,
    };
  }

  if (intent === "shareToBluesky") {
    const uri = formData.get("uri") as string;
    const text = formData.get("text") as string;
    if (!uri || !text) return { ok: false, error: "Missing required fields." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const rkey = uri.split("/").pop()!;

        const [docResult, siteResult] = await Promise.all([
          agent.com.atproto.repo.getRecord({ repo: did, collection: DOCUMENT_COLLECTION, rkey }),
          agent.com.atproto.repo.getRecord({ repo: did, collection: SITE_COLLECTION, rkey: siteSlug }),
        ]);

        const doc = docResult.data.value as Record<string, unknown>;
        const canonicalUrl = String(doc.canonicalUrl ?? "");
        const title = String(doc.title ?? "");
        const description = doc.description ? String(doc.description) : undefined;
        const publicationUri = `at://${did}/${SITE_COLLECTION}/${siteSlug}`;
        const publicationCid = siteResult.data.cid;

        let coverImageBlobRef: unknown;
        if (doc.splashImageUrl) {
          try {
            const thumbSrc = resolveThumbUrl(String(doc.splashImageUrl));
            let imgRes = await fetch(thumbSrc);
            if (!imgRes.ok && thumbSrc !== String(doc.splashImageUrl)) {
              imgRes = await fetch(String(doc.splashImageUrl));
            }
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const mimeType = imgRes.headers.get("content-type") ?? "image/webp";
              const uploadRes = await agent.uploadBlob(new Uint8Array(imgBuffer), {
                encoding: mimeType,
              });
              coverImageBlobRef = uploadRes.data.blob;
            }
          } catch (blobErr) {
            logger.warn(
              { event: "article.share.cover_image_blob_error", error: String(blobErr) },
              "cover image blob upload failed — sharing without thumb",
            );
          }
        }

        const external: Record<string, unknown> = {
          uri: canonicalUrl,
          title,
          description: description ?? "",
          associatedRefs: [
            { $type: "com.atproto.repo.strongRef", uri, cid: docResult.data.cid },
            { $type: "com.atproto.repo.strongRef", uri: publicationUri, cid: publicationCid },
          ],
        };
        if (coverImageBlobRef !== undefined) external.thumb = coverImageBlobRef;

        const postResult = await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: "app.bsky.feed.post",
          record: {
            $type: "app.bsky.feed.post",
            text,
            embed: { $type: "app.bsky.embed.external", external },
            createdAt: new Date().toISOString(),
          },
        });

        const bskyPostRef = { uri: postResult.data.uri, cid: postResult.data.cid };

        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
          record: { ...doc, bskyPostRef, updatedAt: new Date().toISOString() },
          swapRecord: docResult.data.cid,
        });

        await mutateSiteRecord(agent, did, siteSlug, (val) => ({
          ...val,
          ungroupedArticles: (val.ungroupedArticles ?? []).map((a) =>
            a.uri === uri ? { ...a, bskyPostRef } : a,
          ),
          groups: (val.groups ?? []).map((g) => ({
            ...g,
            articles: (g.articles ?? []).map((a) =>
              a.uri === uri ? { ...a, bskyPostRef } : a,
            ),
          })),
          updatedAt: new Date().toISOString(),
        }));

        return { ok: true, uri, bskyPostRef };
      } catch (err) {
        console.error("Failed to share article to Bluesky:", err);
        return { ok: false, error: "Failed to share article to Bluesky." };
      }
    }

    return { ok: true, uri, bskyPostRef: null };
  }

  if (intent === "notifySubscribers") {
    const publicationUri = (formData.get("publicationUri") as string) ?? "";
    const siteTitle = (formData.get("siteTitle") as string) ?? "";
    const articleTitle = (formData.get("articleTitle") as string) ?? "";
    const canonicalUrl = (formData.get("canonicalUrl") as string) ?? "";
    const origin = (formData.get("origin") as string) ?? "";

    const socialServiceUrl = process.env.SOCIAL_SERVICE_URL ?? "https://social.scribe-atp.app";
    const notifySecret = process.env.NOTIFY_SECRET;

    if (useRealOAuth && notifySecret && publicationUri && articleTitle && canonicalUrl) {
      try {
        const res = await fetch(`${socialServiceUrl}/notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${notifySecret}`,
          },
          body: JSON.stringify({ publicationUri, siteTitle, articleTitle, canonicalUrl, origin }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json() as { ok?: boolean; sent?: number; skipped?: number };
        if (data.ok) {
          return { ok: true, sent: data.sent ?? 0, skipped: data.skipped ?? 0 };
        }
      } catch (err) {
        logger.warn({ event: "notify.cms_call_failed", error: String(err) }, "notify call failed");
      }
    }

    return { ok: true, sent: 0, skipped: 0 };
  }

  return redirect(`/article/list/${siteSlug}`);
}

function CreateGroupModal({
  onClose,
  siteUrl,
  urlPrefix,
}: {
  onClose: () => void;
  siteUrl: string;
  urlPrefix: string;
}) {
  const fetcher = useFetcher<{ error?: string }>();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const slugDirtyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isPending = fetcher.state !== "idle";
  const slugValid = slug === "" || SLUG_RE.test(slug);
  const composedPath = [siteUrl, urlPrefix, slug].filter(Boolean).join("/");

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) {
      onCloseRef.current();
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}
    >
      <input type="hidden" name="_intent" value="createGroup" />
      <Input
        id="group-title"
        name="title"
        label="Group title"
        placeholder="e.g. Engineering"
        value={title}
        onChange={(e) => {
          const value = e.target.value;
          setTitle(value);
          if (!slugDirtyRef.current) setSlug(toSlug(value));
        }}
        autoFocus
      />
      <Input
        id="group-slug"
        name="slug"
        label="URL path"
        placeholder="e.g. engineering"
        value={slug}
        onChange={(e) => {
          slugDirtyRef.current = true;
          setSlug(e.target.value.toLowerCase());
        }}
        error={
          !slugValid
            ? "Lowercase letters, numbers and hyphens only."
            : undefined
        }
      />
      {slug && slugValid && (
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          Path: <code>{composedPath}</code>
        </p>
      )}
      {fetcher.data?.error && (
        <p
          style={{
            fontSize: "1.3rem",
            color: "var(--action-danger)",
            margin: 0,
          }}
        >
          {fetcher.data.error}
        </p>
      )}
      <p
        style={{
          fontSize: "1.2rem",
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        The URL path cannot be changed after the group is created.
      </p>
      <Button
        type="submit"
        disabled={isPending || !title.trim() || !slug || !slugValid}
      >
        {isPending ? "Creating…" : "Create Group"}
      </Button>
    </fetcher.Form>
  );
}

function PublishArticleModal({
  article,
  groups,
}: {
  article: { uri: string; title: string; assignedSites: SiteAssignment[] } | null;
  groups: { slug: string; title: string }[];
}) {
  if (!article) return null;

  if (groups.length === 0) {
    return (
      <p style={{ fontSize: "1.3rem", color: "var(--text-secondary)" }}>
        No groups exist yet. Create a group first before publishing an article.
      </p>
    );
  }

  const sortedSites = [...article.assignedSites].sort((a, b) =>
    a.url.localeCompare(b.url),
  );
  const showCanonicalPicker = sortedSites.length > 1;

  return (
    <Form id="publish-article-form" method="post">
      <input type="hidden" name="_intent" value="publishArticle" />
      <input type="hidden" name="uri" value={article.uri} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <p style={{ margin: 0, fontSize: "1.3rem" }}>
          Publish <strong>{article.title}</strong> to:
        </p>
        <Select
          name="groupSlug"
          options={groups.map((g) => ({ value: g.slug, label: g.title }))}
        />
        <input
          type="hidden"
          name="siteAssignments"
          value={JSON.stringify(
            sortedSites.map((s) => ({
              rkey: s.rkey,
              domain: s.url,
              basePath: s.urlPrefix,
            })),
          )}
        />
        {showCanonicalPicker ? (
          <>
            <p style={{ margin: "0.4rem 0 0", fontSize: "1.3rem" }}>
              Set as canonical site:
            </p>
            <Select
              name="canonicalSiteRkey"
              options={sortedSites.map((s) => ({
                value: s.rkey,
                label: s.title,
              }))}
            />
          </>
        ) : (
          <input
            type="hidden"
            name="canonicalSiteRkey"
            value={sortedSites[0]?.rkey ?? ""}
          />
        )}
      </div>
    </Form>
  );
}

function ShareModal({
  article,
}: {
  article: {
    uri: string;
    title: string;
    bskyPostRef: { uri: string; cid: string } | null | undefined;
  } | null;
}) {
  const [text, setText] = useState(article?.title ?? "");

  useEffect(() => {
    setText(article?.title ?? "");
  }, [article?.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!article) return null;

  return (
    <form id="share-article-form" method="post">
      <input type="hidden" name="_intent" value="shareToBluesky" />
      <input type="hidden" name="uri" value={article.uri} />
      {article.bskyPostRef && (
        <p style={{ marginBottom: "1rem", color: "var(--color-warning, #d97706)" }}>
          This article has already been shared to Bluesky. Sharing again will create a new post.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label htmlFor="share-text">Post text</label>
        <textarea
          id="share-text"
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          style={{ resize: "vertical", width: "100%", padding: "0.5rem" }}
        />
      </div>
    </form>
  );
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function SiteListView({ loaderData }: Route.ComponentProps) {
  const { site, devMode, articleSiteAssignments, publicationUri, notifySubscribersEnabled } = loaderData;
  const { isOpen, open, close } = useModal();

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isNewRoute = pathname.endsWith("/new");

  const openedByRouteRef = useRef(false);
  useEffect(() => {
    if (isNewRoute && !openedByRouteRef.current) {
      openedByRouteRef.current = true;
      open();
    }
    if (!isNewRoute) openedByRouteRef.current = false;
  }, [isNewRoute]);

  function handleCloseModal() {
    close();
    if (isNewRoute) navigate(`/article/list/${site.rkey}`, { replace: true });
  }

  const [publishingArticle, setPublishingArticle] = useState<{
    uri: string;
    title: string;
    assignedSites: SiteAssignment[];
  } | null>(null);
  const publishModal = useModal();

  const [sharingArticle, setSharingArticle] = useState<{
    uri: string;
    title: string;
    bskyPostRef: { uri: string; cid: string } | null | undefined;
  } | null>(null);
  const shareModal = useModal();

  const { tree, setTree, isDirty, markSaved, removeGroup, moveArticleToGroup, setBskyPostRef } =
    useDirtyTree(site);
  const {
    sensors,
    activeArticle,
    activeGroup,
    onDragStart,
    onDragOver,
    onDragEnd,
  } = useSiteListDnD(tree, setTree);

  const saveFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isSaving = saveFetcher.state !== "idle";

  const deleteFetcher = useFetcher<{
    ok?: boolean;
    deletedSlug?: string;
    error?: string;
  }>();
  const publishFetcher = useFetcher<{
    ok?: boolean;
    uri?: string;
    groupSlug?: string;
    error?: string;
    warning?: string;
    notification?: { publicationUri: string; siteTitle: string; articleTitle: string; canonicalUrl: string } | null;
  }>();
  const notifyFetcher = useFetcher<{ ok?: boolean; sent?: number; skipped?: number; error?: string }>();
  const [pendingNotification, setPendingNotification] = useState<{
    publicationUri: string;
    siteTitle: string;
    articleTitle: string;
    canonicalUrl: string;
  } | null>(null);
  const notifyModal = useModal();
  const isNotifying = notifyFetcher.state !== "idle";

  const shareFetcher = useFetcher<{
    ok?: boolean;
    uri?: string;
    bskyPostRef?: { uri: string; cid: string } | null;
    error?: string;
  }>();
  const isPublishing = publishFetcher.state !== "idle";
  const isSharing = shareFetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";
  const deletingSlugRef = useRef<string | null>(null);

  const { addToast } = useToast();
  const blocker = useBlocker(isDirty);
  const proceedAfterSaveRef = useRef(false);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if (saveFetcher.data.ok) {
      markSaved();
      addToast({ heading: "Order saved", variant: "success" });
      if (proceedAfterSaveRef.current) {
        proceedAfterSaveRef.current = false;
        blocker.proceed?.();
      }
    } else if (saveFetcher.data.error) {
      proceedAfterSaveRef.current = false;
      addToast({
        heading: "Save failed",
        content: saveFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [saveFetcher.state, saveFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (publishFetcher.state !== "idle" || !publishFetcher.data) return;
    if (publishFetcher.data.ok) {
      const { uri, groupSlug } = publishFetcher.data;
      if (uri && groupSlug) moveArticleToGroup(uri, groupSlug);
      publishModal.close();
      setPublishingArticle(null);
      addToast({ heading: "Article published", variant: "success" });
      if (publishFetcher.data.warning) {
        addToast({
          heading: "Linked site update failed",
          content: publishFetcher.data.warning,
          variant: "primary",
          autoExpire: false,
        });
      }
      if (notifySubscribersEnabled && publishFetcher.data.notification) {
        setPendingNotification(publishFetcher.data.notification);
        notifyModal.open();
      }
    } else if (publishFetcher.data.error) {
      addToast({
        heading: "Publish error",
        content: publishFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [publishFetcher.state, publishFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (notifyFetcher.state !== "idle" || !notifyFetcher.data) return;
    notifyModal.close();
    setPendingNotification(null);
    if (notifyFetcher.data.ok) {
      const { sent = 0 } = notifyFetcher.data;
      addToast({
        heading: sent === 0 ? "No subscribers to notify" : `Notified ${sent} subscriber${sent === 1 ? "" : "s"}`,
        variant: "success",
      });
    }
  }, [notifyFetcher.state, notifyFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (deleteFetcher.state !== "idle" || !deleteFetcher.data) return;
    if (deleteFetcher.data.ok && deleteFetcher.data.deletedSlug) {
      deletingSlugRef.current = null;
      removeGroup(deleteFetcher.data.deletedSlug);
    } else if (deleteFetcher.data.error) {
      addToast({
        heading: "Delete failed",
        content: deleteFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [deleteFetcher.state, deleteFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (shareFetcher.state !== "idle" || !shareFetcher.data) return;
    if (shareFetcher.data.ok) {
      const { uri, bskyPostRef } = shareFetcher.data;
      if (uri !== undefined) setBskyPostRef(uri, bskyPostRef ?? null);
      shareModal.close();
      setSharingArticle(null);
      addToast({ heading: "Shared to Bluesky", variant: "success" });
    } else if (shareFetcher.data.error) {
      addToast({
        heading: "Share failed",
        content: shareFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [shareFetcher.state, shareFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rootIds = tree.map((n) => n.id);

  function handleDeleteGroup(slug: string) {
    deletingSlugRef.current = slug;
    const formData = new FormData();
    formData.set("_intent", "deleteGroup");
    formData.set("rkey", slug);
    deleteFetcher.submit(formData, { method: "post" });
  }

  function handlePublishClick(uri: string) {
    const rootGroup = tree.find((g) => g.id === "g:root");
    const article = rootGroup?.children.find((c) => c.uri === uri);
    if (!article) return;
    const assignedSites = articleSiteAssignments[uri] ?? [
      { rkey: site.rkey, title: site.title, url: site.url, urlPrefix: site.urlPrefix },
    ];
    setPublishingArticle({ uri, title: article.title, assignedSites });
    publishModal.open();
  }

  function handleShareClick(
    uri: string,
    bskyPostRef: { uri: string; cid: string } | null | undefined,
  ) {
    const article = tree.flatMap((g) => g.children).find((c) => c.uri === uri);
    if (!article) return;
    setSharingArticle({ uri, title: article.title, bskyPostRef });
    shareModal.open();
  }

  function handleSave() {
    const siteData = treeToSiteData(tree);
    const formData = new FormData();
    formData.set("_intent", "saveSite");
    formData.set("siteData", JSON.stringify(siteData));
    saveFetcher.submit(formData, { method: "post" });
  }

  const urlAndPrefix = `${site?.url && site.url}${site?.urlPrefix && "/" + site.urlPrefix}`;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Groups & Articles
        </PageContainerHeading>
      }
      topButtons={
        <ButtonGroupContainer>
          <Link to={`/article/create?site=${site.rkey}`}>
            <Button type="button" variant="primary" tabIndex={-1}>
              Draft New Article
            </Button>
          </Link>
          <Link to={`/article/list/${site.rkey}/new`}>
            <Button type="button" variant="primary" tabIndex={-1}>
              Add New Group
            </Button>
          </Link>
        </ButtonGroupContainer>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
          <PageSection>
            <h6>{site.title}</h6>
          </PageSection>
          <PageSection>
            <GroupList>
              {tree.map((group) => (
                <GroupItem
                  key={group.id}
                  id={group.id}
                  title={group.title}
                  slug={group.slug}
                  articleChildren={
                    group.children.map((c) => ({
                      id: c.id,
                      uri: c.uri,
                      slug: c.slug,
                      title: c.title,
                      createdAt: c.createdAt,
                      bskyPostRef: c.bskyPostRef,
                    })) as TreeArticle[]
                  }
                  isRoot={group.id === "g:root"}
                  articleMode={
                    group.id === "g:root"
                      ? "site-unpublished"
                      : "site-published"
                  }
                  urlAndPrefix={urlAndPrefix}
                  siteName={site.title}
                  onDeleteConfirm={handleDeleteGroup}
                  onPublishClick={handlePublishClick}
                  onShareClick={handleShareClick}
                  isDeleting={
                    isDeleting && deletingSlugRef.current === group.slug
                  }
                />
              ))}
            </GroupList>
          </PageSection>
        </SortableContext>

        <DragOverlay>
          {activeArticle && (
            <ArticleItemPreview
              uri={activeArticle.uri}
              title={activeArticle.title}
              createdAt={activeArticle.createdAt}
            />
          )}
          {activeGroup && activeGroup.id !== "g:root" && (
            <GroupItemPreview
              title={activeGroup.title}
              slug={activeGroup.slug}
            />
          )}
        </DragOverlay>
      </DndContext>

      {devMode && (
        <PageSection>
          <p style={{ color: "orange" }}>Dev mode: no real PDS connected.</p>
        </PageSection>
      )}

      <FooterPortal>
        <Button
          type="button"
          variant="success"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? "Saving…" : "Save Order"}
        </Button>
      </FooterPortal>

      <Modal
        isOpen={publishModal.isOpen}
        onClose={() => {
          publishModal.close();
          setPublishingArticle(null);
        }}
        title="Publish Article"
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => {
                publishModal.close();
                setPublishingArticle(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={
                tree.filter((g) => g.id !== "g:root").length === 0 ||
                isPublishing
              }
              onClick={() => {
                const form = document.getElementById(
                  "publish-article-form",
                ) as HTMLFormElement | null;
                if (!form) return;
                publishFetcher.submit(new FormData(form), { method: "post" });
              }}
            >
              {isPublishing ? "Publishing…" : "Publish"}
            </Button>
          </div>
        }
      >
        <PublishArticleModal
          article={publishingArticle}
          groups={tree
            .filter((g) => g.id !== "g:root")
            .map((g) => ({ slug: g.slug, title: g.title }))}
        />
      </Modal>

      <Modal
        isOpen={shareModal.isOpen}
        onClose={() => {
          shareModal.close();
          setSharingArticle(null);
        }}
        title={sharingArticle?.bskyPostRef ? "Re-share to Bluesky" : "Share to Bluesky"}
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => {
                shareModal.close();
                setSharingArticle(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isSharing}
              onClick={() => {
                const form = document.getElementById(
                  "share-article-form",
                ) as HTMLFormElement | null;
                if (!form) return;
                shareFetcher.submit(new FormData(form), { method: "post" });
              }}
            >
              {isSharing ? "Sharing…" : sharingArticle?.bskyPostRef ? "Re-share" : "Share"}
            </Button>
          </div>
        }
      >
        <ShareModal article={sharingArticle} />
      </Modal>

      <Modal
        isOpen={isOpen}
        onClose={handleCloseModal}
        title="Add new group"
        footer={null}
      >
        <CreateGroupModal
          onClose={handleCloseModal}
          siteUrl={site.url}
          urlPrefix={site.urlPrefix}
        />
      </Modal>

      <Modal
        isOpen={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Unsaved changes"
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard & Leave
            </Button>
            <Button
              variant="success"
              disabled={isSaving}
              onClick={() => {
                proceedAfterSaveRef.current = true;
                handleSave();
              }}
            >
              {isSaving ? "Saving…" : "Save & Leave"}
            </Button>
          </div>
        }
      >
        <p>
          You have unsaved changes to the article order. What would you like to
          do?
        </p>
      </Modal>

      <Modal
        isOpen={notifyModal.isOpen}
        onClose={() => {
          notifyModal.close();
          setPendingNotification(null);
        }}
        title="Notify subscribers?"
        footer={
          <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}>
            <Button
              variant="secondary"
              onClick={() => {
                notifyModal.close();
                setPendingNotification(null);
              }}
            >
              Skip
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={isNotifying}
              onClick={() => {
                if (!pendingNotification) return;
                const fd = new FormData();
                fd.set("_intent", "notifySubscribers");
                fd.set("publicationUri", pendingNotification.publicationUri);
                fd.set("siteTitle", pendingNotification.siteTitle);
                fd.set("articleTitle", pendingNotification.articleTitle);
                fd.set("canonicalUrl", pendingNotification.canonicalUrl);
                fd.set("origin", typeof window !== "undefined" ? window.location.origin : "");
                notifyFetcher.submit(fd, { method: "post" });
              }}
            >
              {isNotifying ? "Notifying…" : "Notify subscribers"}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: "1.3rem" }}>
          Send a Bluesky DM to all subscribers of{" "}
          <strong>{site.title}</strong> about this new article?
        </p>
        {pendingNotification && (
          <p style={{ margin: "0.8rem 0 0", fontSize: "1.2rem", color: "var(--text-secondary)" }}>
            &ldquo;{pendingNotification.articleTitle}&rdquo;
          </p>
        )}
      </Modal>
    </PageContainer>
  );
}
