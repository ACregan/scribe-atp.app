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
  ARTICLE_COLLECTION,
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
import { devSiteListLoader } from "~/services/devFixtures.server";
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

    return {
      devMode: false,
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
              const newPath = `/${g.slug}/${rkey}`;
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
                  canonicalUrl: newCanonicalUrl,
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
            const newPath = `/${arkey}`;
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
                canonicalUrl: newCanonicalUrl,
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

    let draftManifestFailures = 0;

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const rkey = uri.split("/").pop()!;
        const now = new Date().toISOString();

        // The publication ref may already point to app.scribe.article (a draft URI) if
        // the article was added to the site manifest without ever being published to
        // site.standard.document. In that case there is no document to fetch or delete —
        // we only need to move the ref from its group into ungroupedArticles.
        const isAlreadyDraft = uri.includes(`/${ARTICLE_COLLECTION}/`);

        let draftRef: ArticleRef;
        let publishedCid: string | undefined;

        if (isAlreadyDraft) {
          // Ref is already a draft URI — build a stub; mutateSiteRecord merges existingRef on top.
          draftRef = {
            uri,
            slug: rkey,
            title: "",
            splashImageUrl: null,
            description: null,
            createdAt: now,
            updatedAt: now,
          };
        } else {
          const publishedResult = await agent.com.atproto.repo.getRecord({
            repo: did,
            collection: DOCUMENT_COLLECTION,
            rkey,
          });
          publishedCid = publishedResult.data.cid;
          const published = publishedResult.data.value as Record<string, unknown>;

          // Create app.scribe.article draft — preserve all fields, drop site/publishedAt/canonicalUrl, reset path
          const draftRecord: Record<string, unknown> = { ...published };
          delete draftRecord.site;
          delete draftRecord.publishedAt;
          delete draftRecord.canonicalUrl;
          draftRecord.$type = ARTICLE_COLLECTION;
          draftRecord.path = `/${rkey}`;
          draftRecord.updatedAt = now;

          await agent.com.atproto.repo.createRecord({
            repo: did,
            collection: ARTICLE_COLLECTION,
            rkey,
            record: draftRecord,
          });

          draftRef = {
            uri: `at://${did}/${ARTICLE_COLLECTION}/${rkey}`,
            title: String(published.title ?? ""),
            slug: rkey,
            splashImageUrl: published.splashImageUrl
              ? String(published.splashImageUrl)
              : null,
            description: published.description
              ? String(published.description)
              : null,
            createdAt: String(published.createdAt ?? now),
            updatedAt: now,
          };
        }

        // Find all sites containing the URI (skip for already-draft — other sites need no rewrite)
        const otherSiteRkeys = isAlreadyDraft
          ? []
          : (await findSitesContaining(agent, did, uri)).filter((r) => r !== siteSlug);

        // Current site: move from named group → ungroupedArticles, rewrite URI
        await mutateSiteRecord(agent, did, siteSlug, (val) => {
          let existingRef: ArticleRef | undefined;
          const newGroups = (val.groups ?? []).map((g) => {
            const found = g.articles.find((a) => a.uri === uri);
            if (found) existingRef = found;
            return { ...g, articles: g.articles.filter((a) => a.uri !== uri) };
          });
          const ref = existingRef ? { ...existingRef, ...draftRef } : draftRef;
          return {
            ...val,
            groups: newGroups,
            ungroupedArticles: [...(val.ungroupedArticles ?? []), ref],
            updatedAt: now,
          };
        });

        // Other sites: rewrite URI in-place, keeping current group position
        const draftResults = await Promise.allSettled(
          otherSiteRkeys.map((rk) =>
            mutateSiteRecord(agent, did, rk, (val) =>
              updateArticleRef(val, uri, draftRef),
            ),
          ),
        );
        draftManifestFailures = draftResults.filter(r => r.status === "rejected").length;

        // Delete the published record only if one existed
        if (!isAlreadyDraft && publishedCid) {
          await agent.com.atproto.repo.deleteRecord({
            repo: did,
            collection: DOCUMENT_COLLECTION,
            rkey,
            swapRecord: publishedCid,
          });
        }
      } catch (err) {
        console.error("Failed to move article to draft:", err);
      }
    }

    if (draftManifestFailures > 0) {
      return { error: `${draftManifestFailures} site manifest(s) failed to update. The article has been moved to draft.` };
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

    let publishManifestFailures = 0;

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const rkey = uri.split("/").pop()!;
        const publishedAt = new Date().toISOString();

        // Fetch draft and site in parallel
        const [draftResult, siteResult] = await Promise.all([
          agent.com.atproto.repo.getRecord({
            repo: did,
            collection: ARTICLE_COLLECTION,
            rkey,
          }),
          agent.com.atproto.repo.getRecord({
            repo: did,
            collection: SITE_COLLECTION,
            rkey: siteSlug,
          }),
        ]);

        const draft = draftResult.data.value as Record<string, unknown>;
        const pubRecord = siteResult.data.value as Record<string, unknown>;
        const scribeExt = (pubRecord.scribe as Record<string, unknown>) ?? {};

        const siteAtUri = `at://${did}/${SITE_COLLECTION}/${canonicalSiteRkey}`;
        const canonicalAssignment = siteAssignments.find(
          (s) => s.rkey === canonicalSiteRkey,
        ) ?? {
          rkey: canonicalSiteRkey,
          domain: String(scribeExt.domain ?? ""),
          basePath: String(scribeExt.basePath ?? ""),
        };
        const docPath = `/${groupSlug}/${rkey}`;
        const canonicalUrl = canonicalAssignment.basePath
          ? `https://${canonicalAssignment.domain}/${canonicalAssignment.basePath}${docPath}`
          : `https://${canonicalAssignment.domain}${docPath}`;

        // Create site.standard.document record — no explicit rkey so PDS generates a TID
        const createResult = await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          record: {
            ...draft,
            $type: DOCUMENT_COLLECTION,
            path: docPath,
            site: siteAtUri,
            canonicalUrl,
            publishedAt,
            updatedAt: publishedAt,
          },
        });

        const newUri = createResult.data.uri;
        const updatedRef: ArticleRef = {
          uri: newUri,
          title: String(draft.title ?? ""),
          slug: rkey,
          splashImageUrl: draft.splashImageUrl
            ? String(draft.splashImageUrl)
            : null,
          description: draft.description ? String(draft.description) : null,
          createdAt: String(draft.createdAt ?? publishedAt),
          publishedAt,
          updatedAt: publishedAt,
        };

        // Find all sites containing the draft URI before mutating
        const allSiteRkeys = await findSitesContaining(agent, did, uri);
        const otherSiteRkeys = allSiteRkeys.filter((r) => r !== siteSlug);

        // Current site: move from ungroupedArticles → named group, rewrite URI
        await mutateSiteRecord(agent, did, siteSlug, (val) => {
          const existing = (val.ungroupedArticles ?? []).find(
            (a) => a.uri === uri,
          );
          const ref = existing ? { ...existing, ...updatedRef } : updatedRef;
          return {
            ...val,
            ungroupedArticles: (val.ungroupedArticles ?? []).filter(
              (a) => a.uri !== uri,
            ),
            groups: (val.groups ?? []).map((g) =>
              g.slug === groupSlug
                ? { ...g, articles: [...g.articles, ref] }
                : g,
            ),
            updatedAt: publishedAt,
          };
        });

        // Other sites: rewrite URI in-place, keeping current group position
        const publishResults = await Promise.allSettled(
          otherSiteRkeys.map((rk) =>
            mutateSiteRecord(agent, did, rk, (val) =>
              updateArticleRef(val, uri, updatedRef),
            ),
          ),
        );
        publishManifestFailures = publishResults.filter(r => r.status === "rejected").length;

        // Delete the draft
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: ARTICLE_COLLECTION,
          rkey,
          swapRecord: draftResult.data.cid,
        });
      } catch (err) {
        console.error("Failed to publish article:", err);
        return { ok: false };
      }
    }

    if (publishManifestFailures > 0) {
      return { ok: false, error: `${publishManifestFailures} site manifest(s) failed to update. The article was published.` };
    }
    return { ok: true, uri, groupSlug };
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

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function SiteListView({ loaderData }: Route.ComponentProps) {
  const { site, devMode, articleSiteAssignments } = loaderData;
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

  const { tree, setTree, isDirty, markSaved, removeGroup, moveArticleToGroup } =
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
  }>();
  const isPublishing = publishFetcher.state !== "idle";
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
                      title: c.title,
                      createdAt: c.createdAt,
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
    </PageContainer>
  );
}
