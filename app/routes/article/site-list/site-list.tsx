import type { Route } from "./+types/site-list";
import {
  redirect,
  useFetcher,
  useBlocker,
  useNavigate,
  useLocation,
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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useState, useRef, useEffect, useMemo } from "react";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { useToast } from "~/components/Toast/ToastContext";

import { SITE_COLLECTION, SLUG_RE } from "~/constants";
import type { ArticleRef, SiteGroup } from "~/hooks/types";
import {
  type SiteData,
  type SiteRecordValue,
  type TreeArticleNode,
  type TreeGroupNode,
  slugFromUri,
  articleId,
  groupId,
  toSlug,
  buildTreeFromSite,
  treeToSiteData,
  removeArticleRef,
} from "./siteTree";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

function findArticleLocation(
  tree: TreeGroupNode[],
  id: string,
): { groupIdx: number; childIdx: number } | null {
  for (let i = 0; i < tree.length; i++) {
    const ci = tree[i].children.findIndex((c) => c.id === id);
    if (ci !== -1) return { groupIdx: i, childIdx: ci };
  }
  return null;
}

export function meta({ data }: Route.MetaArgs) {
  const title = data?.site?.title ?? "Site";
  return [{ title: `Scribe ATP – ${title}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const siteSlug = params.siteSlug;

  if (!useRealOAuth) {
    return {
      devMode: true,
      site: {
        rkey: siteSlug,
        cid: "dev-cid-site",
        url: "norobots.blog",
        title: "NoRobots.blog (Dev)",
        urlPrefix: "blog",
        groups: [
          {
            slug: "engineering",
            title: "Engineering",
            articles: [
              {
                uri: "at://did:dev:user/app.scribe.article/hello-world",
                title: "Hello World",
                splashImageUrl: null,
                createdAt: "2025-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
        ungroupedArticles: [
          {
            uri: "at://did:dev:user/app.scribe.article/getting-started",
            title: "Getting Started with AT Protocol",
            splashImageUrl: null,
            createdAt: "2025-02-01T00:00:00.000Z",
          },
          {
            uri: "at://did:dev:user/app.scribe.article/lexical-editor",
            title: "Building a Rich Text Editor with Lexical",
            splashImageUrl: null,
            createdAt: "2025-03-20T00:00:00.000Z",
          },
        ],
      } as SiteData,
    };
  }

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
      } as SiteData,
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
      const val = rec.data.value as SiteData;
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
        <p style={{ fontSize: "1.2rem", color: "var(--mid-grey)", margin: 0 }}>
          Path: <code>{composedPath}</code>
        </p>
      )}
      {fetcher.data?.error && (
        <p style={{ fontSize: "1.3rem", color: "var(--red)", margin: 0 }}>
          {fetcher.data.error}
        </p>
      )}
      <p style={{ fontSize: "1.2rem", color: "var(--mid-grey)", margin: 0 }}>
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
  }, []);

  function handleCloseModal() {
    close();
    if (isNewRoute) navigate(`/article/list/${site.rkey}`, { replace: true });
  }

  const [tree, setTree] = useState<TreeGroupNode[]>(() =>
    buildTreeFromSite(site),
  );
  const [activeArticle, setActiveArticle] = useState<TreeArticleNode | null>(
    null,
  );
  const [activeGroup, setActiveGroup] = useState<TreeGroupNode | null>(null);
  const previousTreeRef = useRef<TreeGroupNode[]>(tree);
  const saveFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isSaving = saveFetcher.state !== "idle";

  const deleteFetcher = useFetcher<{
    ok?: boolean;
    deletedSlug?: string;
    error?: string;
  }>();
  const isDeleting = deleteFetcher.state !== "idle";
  const deletingSlugRef = useRef<string | null>(null);

  const { addToast } = useToast();

  // Tracks the tree as it exists on the PDS — updated after each successful save.
  // Must be state (not a ref) so that updating it triggers isDirty to recompute.
  const [savedTree, setSavedTree] = useState<TreeGroupNode[]>(() =>
    buildTreeFromSite(site),
  );
  const proceedAfterSaveRef = useRef(false);

  // Track which group slugs are already in the tree so we can detect new ones
  // added server-side (after createGroup revalidates the loader).
  const knownGroupSlugsRef = useRef<Set<string>>(
    new Set(site.groups.map((g) => g.slug)),
  );

  useEffect(() => {
    const newGroups = site.groups.filter(
      (g) => !knownGroupSlugsRef.current.has(g.slug),
    );
    if (newGroups.length === 0) return;

    newGroups.forEach((g) => knownGroupSlugsRef.current.add(g.slug));

    const newNodes: TreeGroupNode[] = newGroups.map((g) => ({
      kind: "group",
      id: groupId(g.slug),
      slug: g.slug,
      title: g.title,
      children: [],
    }));

    setTree((prev) => [...prev, ...newNodes]);
    // Keep savedTree in sync so newly persisted groups don't register as unsaved changes.
    setSavedTree((prev) => [...prev, ...newNodes]);

    if (newGroups.length === 1) {
      addToast({
        heading: "Group created",
        content: newGroups[0].title,
        variant: "primary",
      });
    } else {
      addToast({
        heading: `${newGroups.length} groups added`,
        variant: "primary",
      });
    }
  }, [site.groups]);

  useEffect(() => {
    if (deleteFetcher.state !== "idle" || !deleteFetcher.data) return;
    if (deleteFetcher.data.ok && deleteFetcher.data.deletedSlug) {
      const slug = deleteFetcher.data.deletedSlug;
      deletingSlugRef.current = null;
      knownGroupSlugsRef.current.delete(slug);
      setTree((prev) => prev.filter((g) => g.slug !== slug));
      setSavedTree((prev) => prev.filter((g) => g.slug !== slug));
    } else if (deleteFetcher.data.error) {
      addToast({
        heading: "Delete failed",
        content: deleteFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [deleteFetcher.state, deleteFetcher.data]);

  const isDirty = useMemo(
    () => JSON.stringify(tree) !== JSON.stringify(savedTree),
    [tree, savedTree],
  );

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if (saveFetcher.data.ok) {
      setSavedTree(tree);
      addToast({ heading: "Order saved", variant: "primary" });
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
  }, [saveFetcher.state, saveFetcher.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const rootIds = tree.map((n) => n.id);

  function onDragStart({ active }: DragStartEvent) {
    previousTreeRef.current = tree;
    const id = String(active.id);
    if (id.startsWith("a:")) {
      const loc = findArticleLocation(tree, id);
      setActiveArticle(loc ? tree[loc.groupIdx].children[loc.childIdx] : null);
      setActiveGroup(null);
    } else {
      setActiveGroup(
        id !== "g:root" ? (tree.find((n) => n.id === id) ?? null) : null,
      );
      setActiveArticle(null);
    }
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    if (activeId.startsWith("g:")) {
      if (
        activeId === "g:root" ||
        !overId.startsWith("g:") ||
        overId === "g:root"
      )
        return;
      setTree((prev) => {
        const sourceIdx = prev.findIndex((n) => n.id === activeId);
        const overIdx = prev.findIndex((n) => n.id === overId);
        if (sourceIdx === -1 || overIdx === -1 || sourceIdx === overIdx)
          return prev;
        return arrayMove(prev, sourceIdx, overIdx);
      });
      return;
    }

    if (!activeId.startsWith("a:")) return;

    setTree((prev) => {
      const srcLoc = findArticleLocation(prev, activeId);
      if (!srcLoc) return prev;
      const activeNode = prev[srcLoc.groupIdx].children[srcLoc.childIdx];

      if (overId.startsWith("g:")) {
        const targetGroupIdx = prev.findIndex((n) => n.id === overId);
        if (targetGroupIdx === -1 || targetGroupIdx === srcLoc.groupIdx)
          return prev;
        if (prev[targetGroupIdx].children.length > 0) return prev;
        return prev.map((group, i) => {
          if (i === srcLoc.groupIdx)
            return {
              ...group,
              children: group.children.filter(
                (_, ci) => ci !== srcLoc.childIdx,
              ),
            };
          if (i === targetGroupIdx)
            return { ...group, children: [...group.children, activeNode] };
          return group;
        });
      }

      if (overId.startsWith("a:")) {
        const dstLoc = findArticleLocation(prev, overId);
        if (!dstLoc) return prev;
        if (srcLoc.groupIdx === dstLoc.groupIdx) {
          if (srcLoc.childIdx === dstLoc.childIdx) return prev;
          return prev.map((group, i) =>
            i === srcLoc.groupIdx
              ? {
                  ...group,
                  children: arrayMove(
                    group.children,
                    srcLoc.childIdx,
                    dstLoc.childIdx,
                  ),
                }
              : group,
          );
        }
        return prev.map((group, i) => {
          if (i === srcLoc.groupIdx)
            return {
              ...group,
              children: group.children.filter(
                (_, ci) => ci !== srcLoc.childIdx,
              ),
            };
          if (i === dstLoc.groupIdx) {
            const next = [...group.children];
            next.splice(dstLoc.childIdx, 0, activeNode);
            return { ...group, children: next };
          }
          return group;
        });
      }

      return prev;
    });
  }

  function onDragEnd({ over }: DragEndEvent) {
    if (!over) setTree(previousTreeRef.current);
    setActiveArticle(null);
    setActiveGroup(null);
  }

  function handleDeleteGroup(slug: string) {
    deletingSlugRef.current = slug;
    const formData = new FormData();
    formData.set("_intent", "deleteGroup");
    formData.set("rkey", slug);
    deleteFetcher.submit(formData, { method: "post" });
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
            <Button type="button" variant="primary">
              Draft New Article
            </Button>
          </Link>
          <Link to={`/article/list/${site.rkey}/new`}>
            <Button type="button" variant="primary">
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
                  articleMode="site"
                  urlAndPrefix={urlAndPrefix}
                  onDeleteConfirm={handleDeleteGroup}
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
          variant="primary"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? "Saving…" : "Save Order"}
        </Button>
      </FooterPortal>

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
              variant="primary"
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
