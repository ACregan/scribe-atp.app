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

import {
  DOCUMENT_COLLECTION,
  READER_BASE_URL,
  SITE_COLLECTION,
  SLUG_RE,
} from "~/constants";
import { listDocuments } from "~/services/documentRepository.server";
import type { ArticleRef, SiteGroup } from "~/hooks/types";
import {
  type SiteManifest,
  toSlug,
  treeToSiteData,
} from "./siteTree";
import { useDirtyTree } from "./useDirtyTree";
import { useSiteListDnD } from "./useSiteListDnD";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import {
  createGroup as createGroupManifest,
  deleteGroup as deleteGroupManifest,
  unpublishArticle,
  removeArticleFromSite as removeArticleFromSiteManifest,
  saveSiteOrder,
  validateGroupFields,
} from "~/services/siteManifest.server";
import { resolveThumbUrl } from "~/services/article.server";
import { devSiteListLoader } from "~/services/devFixtures.server";
import { logger } from "~/services/logger.server";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.site?.title ?? "Site";
  return [{ title: `Scribe ATP – ${title}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const siteSlug = params.siteSlug;

  if (!useRealOAuth) return devSiteListLoader(siteSlug);

  try {
    const { agent, did } = await requireAtpAgent(request);
    const [record, documents] = await Promise.all([
      agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
      }),
      listDocuments(agent, did),
    ]);

    const value = record.data.value as Record<string, unknown>;
    const scribeVal = (value.scribe as Record<string, unknown>) ?? {};

    // ADR 0013: a document's own `site` field is the sole loose-vs-published
    // signal — a loose document's `site` is a reader URL, not an at:// URI.
    const hasUnassignedArticles = documents.some((d) =>
      String(d.value.site ?? "").startsWith(READER_BASE_URL),
    );

    return {
      devMode: false,
      hasUnassignedArticles,
      site: {
        rkey: siteSlug,
        cid: record.data.cid,
        url: String(scribeVal.domain ?? ""),
        title: String(scribeVal.title ?? ""),
        urlPrefix: String(scribeVal.basePath ?? ""),
        groups: (scribeVal.groups as SiteGroup[]) ?? [],
        ungroupedArticles: (scribeVal.ungroupedArticles as ArticleRef[]) ?? [],
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
    const slugInput = formData.get("slug") as string;
    const validated = validateGroupFields(title, slugInput);
    if ("error" in validated) return validated;
    if (!useRealOAuth) return { ok: true };

    const agent = await getAtpAgent(did);
    return createGroupManifest(agent, did, siteSlug, {
      title,
      slug: validated.slug,
    });
  }

  if (intent === "deleteGroup") {
    const rkey = formData.get("rkey") as string;
    if (!rkey) return { ok: false, error: "Missing group ID." };
    if (!useRealOAuth) return { ok: true, deletedSlug: rkey };

    const agent = await getAtpAgent(did);
    return deleteGroupManifest(agent, did, siteSlug, rkey);
  }

  if (intent === "saveSite") {
    const siteDataJson = formData.get("siteData") as string;
    if (!siteDataJson) return { error: "No data." };
    if (!useRealOAuth) return { ok: true };

    const agent = await getAtpAgent(did);
    const { groups, ungroupedArticles } = JSON.parse(siteDataJson) as {
      groups: SiteGroup[];
      ungroupedArticles: ArticleRef[];
    };
    return saveSiteOrder(agent, did, siteSlug, { groups, ungroupedArticles });
  }

  if (intent === "removeArticle") {
    const uri = formData.get("uri") as string;
    if (!uri) return redirect(`/article/list/${siteSlug}`);

    if (useRealOAuth) {
      const agent = await getAtpAgent(did);
      await removeArticleFromSiteManifest(agent, did, siteSlug, uri);
    }

    return redirect(`/article/list/${siteSlug}`);
  }

  if (intent === "moveToDraft") {
    const uri = formData.get("uri") as string;
    if (!uri) return redirect(`/article/list/${siteSlug}`);

    if (useRealOAuth) {
      const agent = await getAtpAgent(did);
      await unpublishArticle(agent, did, siteSlug, uri);
    }

    return redirect(`/article/list/${siteSlug}`);
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
        const docScribe = (doc.scribe as Record<string, unknown>) ?? {};
        const canonicalUrl = String(docScribe.canonicalUrl ?? "");
        const title = String(doc.title ?? "");
        const description = doc.description
          ? String(doc.description)
          : undefined;
        const publicationUri = `at://${did}/${SITE_COLLECTION}/${siteSlug}`;
        const publicationCid = siteResult.data.cid;

        const coverImageUrl = String(docScribe.coverImageUrl ?? "");
        let coverImageBlobRef: unknown;
        if (coverImageUrl) {
          try {
            const thumbSrc = resolveThumbUrl(coverImageUrl);
            let imgRes = await fetch(thumbSrc);
            if (!imgRes.ok && thumbSrc !== coverImageUrl) {
              imgRes = await fetch(coverImageUrl);
            }
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const mimeType =
                imgRes.headers.get("content-type") ?? "image/webp";
              const uploadRes = await agent.uploadBlob(
                new Uint8Array(imgBuffer),
                {
                  encoding: mimeType,
                },
              );
              coverImageBlobRef = uploadRes.data.blob;
            }
          } catch (blobErr) {
            logger.warn(
              {
                event: "article.share.cover_image_blob_error",
                error: String(blobErr),
              },
              "cover image blob upload failed — sharing without thumb",
            );
          }
        }

        const external: Record<string, unknown> = {
          uri: canonicalUrl,
          title,
          description: description ?? "",
          associatedRefs: [
            {
              $type: "com.atproto.repo.strongRef",
              uri,
              cid: docResult.data.cid,
            },
            {
              $type: "com.atproto.repo.strongRef",
              uri: publicationUri,
              cid: publicationCid,
            },
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

        const bskyPostRef = {
          uri: postResult.data.uri,
          cid: postResult.data.cid,
        };

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
        logger.error(
          { event: "article.share.error", error: String(err) },
          "article.share.error",
        );
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Share failed: ${message}` };
      }
    }

    return { ok: true, uri, bskyPostRef: null };
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
        <p
          style={{
            marginBottom: "1rem",
            color: "var(--color-warning, #d97706)",
          }}
        >
          This article has already been shared to Bluesky. Sharing again will
          create a new post.
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
  const { site, devMode, hasUnassignedArticles } = loaderData;
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

  const [sharingArticle, setSharingArticle] = useState<{
    uri: string;
    title: string;
    bskyPostRef: { uri: string; cid: string } | null | undefined;
  } | null>(null);
  const shareModal = useModal();

  const {
    tree,
    setTree,
    isDirty,
    markSaved,
    removeGroup,
    setBskyPostRef,
  } = useDirtyTree(site);
  const {
    sensors,
    activeArticle,
    activeGroup,
    onDragStart,
    onDragOver,
    onDragEnd,
  } = useSiteListDnD(tree, setTree);

  // Does at least one *other* group on this site already have articles? If
  // so, an empty group is a legitimate drag-and-drop target (move an
  // article here from that other group) — show the "Drop articles here"
  // hint. If not, dragging isn't a real option yet, so point the user at
  // writing or assigning an article instead (see GroupItem).
  const siteHasAnyArticles = tree.some(
    (group) => group.id !== "g:root" && group.children.length > 0,
  );

  const saveFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isSaving = saveFetcher.state !== "idle";

  const deleteFetcher = useFetcher<{
    ok?: boolean;
    deletedSlug?: string;
    error?: string;
  }>();
  const shareFetcher = useFetcher<{
    ok?: boolean;
    uri?: string;
    bskyPostRef?: { uri: string; cid: string } | null;
    error?: string;
  }>();
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
              {/* g:root never has anything to render — since ADR 0013 every
                  document reaching this site is already published into a
                  named group; nothing populates ungroupedArticles anymore. */}
              {tree
                .filter((group) => group.id !== "g:root")
                .map((group) => (
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
                    articleMode="site-published"
                    urlAndPrefix={urlAndPrefix}
                    siteName={site.title}
                    onDeleteConfirm={handleDeleteGroup}
                    onShareClick={handleShareClick}
                    isDeleting={
                      isDeleting && deletingSlugRef.current === group.slug
                    }
                    siteHasAnyArticles={siteHasAnyArticles}
                    hasUnassignedArticles={hasUnassignedArticles}
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
        isOpen={shareModal.isOpen}
        onClose={() => {
          shareModal.close();
          setSharingArticle(null);
        }}
        title={
          sharingArticle?.bskyPostRef
            ? "Re-share to Bluesky"
            : "Share to Bluesky"
        }
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
              {isSharing
                ? "Sharing…"
                : sharingArticle?.bskyPostRef
                  ? "Re-share"
                  : "Share"}
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
    </PageContainer>
  );
}
