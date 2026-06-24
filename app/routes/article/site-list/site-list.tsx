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

export function meta({ data }: Route.MetaArgs) {
  const title = data?.site?.title ?? "Site";
  return [{ title: `Scribe ATP – ${title}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const siteSlug = params.siteSlug;

  if (!useRealOAuth) return devSiteListLoader(siteSlug);

  try {
    const { agent, did } = await requireAtpAgent(request);
    const record = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: SITE_COLLECTION,
      rkey: siteSlug,
    });

    const value = record.data.value as Record<string, unknown>;
    return {
      devMode: false,
      site: {
        rkey: siteSlug,
        cid: record.data.cid,
        url: String(value.url ?? ""),
        title: String(value.title ?? ""),
        urlPrefix: String(value.urlPrefix ?? ""),
        groups: (value.groups as SiteGroup[]) ?? [],
        ungroupedArticles: (value.ungroupedArticles as ArticleRef[]) ?? [],
      } as SiteManifest,
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
      const val = rec.data.value as SiteManifest;
      if ((val.groups ?? []).some((g) => g.slug === slug)) {
        return { error: "A group with this name already exists." };
      }
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
        record: {
          ...val,
          groups: [...(val.groups ?? []), { slug, title, articles: [] }],
          updatedAt: new Date().toISOString(),
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
        await mutateSiteRecord(agent, did, siteSlug, (val) => ({
          ...val,
          groups: groups as SiteRecordValue["groups"],
          ungroupedArticles,
          updatedAt: new Date().toISOString(),
        }));
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

        const publishedResult = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
        });
        const published = publishedResult.data.value as Record<string, unknown>;

        // Create app.scribe.article draft — preserve all fields, drop site/publishedAt, reset path
        const draftRecord: Record<string, unknown> = { ...published };
        delete draftRecord.site;
        delete draftRecord.publishedAt;
        draftRecord.$type = ARTICLE_COLLECTION;
        draftRecord.path = `/${rkey}`;
        draftRecord.updatedAt = now;

        await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: ARTICLE_COLLECTION,
          rkey,
          record: draftRecord,
        });

        const newUri = `at://${did}/${ARTICLE_COLLECTION}/${rkey}`;
        const draftRef: ArticleRef = {
          uri: newUri,
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

        // Find all sites containing the published URI before mutating
        const allSiteRkeys = await findSitesContaining(agent, did, uri);
        const otherSiteRkeys = allSiteRkeys.filter((r) => r !== siteSlug);

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
        await Promise.allSettled(
          otherSiteRkeys.map((rk) =>
            mutateSiteRecord(agent, did, rk, (val) =>
              updateArticleRef(val, uri, draftRef),
            ),
          ),
        );

        // Delete the published record
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
          swapRecord: publishedResult.data.cid,
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
    if (!uri || !groupSlug) return { ok: false };

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
        const siteVal = siteResult.data.value as SiteRecordValue;
        const siteUrl = siteVal.urlPrefix
          ? `https://${siteVal.url}/${siteVal.urlPrefix}`
          : `https://${siteVal.url}`;

        // Create site.standard.document record
        await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
          record: {
            ...draft,
            $type: DOCUMENT_COLLECTION,
            path: `/${groupSlug}/${rkey}`,
            site: siteUrl,
            publishedAt,
            updatedAt: publishedAt,
          },
        });

        const newUri = `at://${did}/${DOCUMENT_COLLECTION}/${rkey}`;
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
        await Promise.allSettled(
          otherSiteRkeys.map((rk) =>
            mutateSiteRecord(agent, did, rk, (val) =>
              updateArticleRef(val, uri, updatedRef),
            ),
          ),
        );

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
  article: { uri: string; title: string } | null;
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
      </div>
    </Form>
  );
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function SiteListView({ loaderData }: Route.ComponentProps) {
  const { site, devMode } = loaderData;
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
    if (publishFetcher.state !== "idle" || !publishFetcher.data?.ok) return;
    const { uri, groupSlug } = publishFetcher.data;
    if (uri && groupSlug) moveArticleToGroup(uri, groupSlug);
    publishModal.close();
    setPublishingArticle(null);
    addToast({ heading: "Article published", variant: "success" });
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
    setPublishingArticle({ uri, title: article.title });
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
