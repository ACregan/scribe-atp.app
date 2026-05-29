import type { Route } from "./+types/site-list";
import { redirect, useFetcher, Link } from "react-router";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import {
  PageContainer,
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
import { useState, useRef, useEffect } from "react";
import FooterPortal from "~/components/FooterPortal/FooterPortal";

const SITE_COLLECTION = "app.scribe.site";

type SiteArticleRef = {
  uri: string;
  title: string;
  splashImageUrl: string | null;
  createdAt: string;
};

type SiteGroup = {
  slug: string;
  title: string;
  articles: SiteArticleRef[];
};

type SiteData = {
  rkey: string;
  cid: string;
  url: string;
  title: string;
  urlPrefix: string;
  groups: SiteGroup[];
  articles: SiteArticleRef[];
};

type TreeArticleNode = {
  kind: "article";
  id: string;
  uri: string;
  title: string;
  splashImageUrl: string | null;
  createdAt: string;
};

type TreeGroupNode = {
  kind: "group";
  id: string;
  slug: string;
  title: string;
  children: TreeArticleNode[];
};

function slugFromUri(uri: string): string {
  return uri.split("/").pop()!;
}

function articleId(slug: string): string {
  return `a:${slug}`;
}

function groupId(slug: string): string {
  return `g:${slug}`;
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function buildTreeFromSite(site: SiteData): TreeGroupNode[] {
  const root: TreeGroupNode = {
    kind: "group",
    id: "g:root",
    slug: "root",
    title: "Ungrouped",
    children: (site.articles ?? []).map((a) => ({
      kind: "article",
      id: articleId(slugFromUri(a.uri)),
      uri: a.uri,
      title: a.title,
      splashImageUrl: a.splashImageUrl,
      createdAt: a.createdAt,
    })),
  };

  const named: TreeGroupNode[] = (site.groups ?? []).map((g) => ({
    kind: "group",
    id: groupId(g.slug),
    slug: g.slug,
    title: g.title,
    children: (g.articles ?? []).map((a) => ({
      kind: "article",
      id: articleId(slugFromUri(a.uri)),
      uri: a.uri,
      title: a.title,
      splashImageUrl: a.splashImageUrl,
      createdAt: a.createdAt,
    })),
  }));

  return [root, ...named];
}

function treeToSiteData(tree: TreeGroupNode[]): {
  groups: SiteGroup[];
  articles: SiteArticleRef[];
} {
  const groups: SiteGroup[] = [];
  const articles: SiteArticleRef[] = [];

  for (const node of tree) {
    if (node.id === "g:root") {
      for (const child of node.children) {
        articles.push({
          uri: child.uri,
          title: child.title,
          splashImageUrl: child.splashImageUrl,
          createdAt: child.createdAt,
        });
      }
    } else {
      groups.push({
        slug: node.slug,
        title: node.title,
        articles: node.children.map((c) => ({
          uri: c.uri,
          title: c.title,
          splashImageUrl: c.splashImageUrl,
          createdAt: c.createdAt,
        })),
      });
    }
  }

  return { groups, articles };
}

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
  const { did } = await requireAuth(request);
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
        articles: [
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
    const agent = await getAtpAgent(did);
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
        articles: (value.articles as SiteArticleRef[]) ?? [],
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
    const slug = toSlug(title);
    if (!slug)
      return { error: "Title must contain at least one letter or number." };

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

    return redirect(`/article/list/${siteSlug}`);
  }

  if (intent === "deleteGroup") {
    const rkey = formData.get("rkey") as string;
    if (!rkey) return redirect(`/article/list/${siteSlug}`);

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const rec = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
        });
        const val = rec.data.value as SiteData;
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
          record: {
            ...val,
            groups: (val.groups ?? []).filter((g) => g.slug !== rkey),
            updatedAt: new Date().toISOString(),
          },
          swapRecord: rec.data.cid,
        });
      } catch (err) {
        console.error("Failed to delete group:", err);
      }
    }

    return redirect(`/article/list/${siteSlug}`);
  }

  if (intent === "saveSite") {
    const siteDataJson = formData.get("siteData") as string;
    if (!siteDataJson) return { error: "No data." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        const rec = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
        });
        const val = rec.data.value as Record<string, unknown>;
        const { groups, articles } = JSON.parse(siteDataJson) as {
          groups: SiteGroup[];
          articles: SiteArticleRef[];
        };
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
          record: {
            ...val,
            groups,
            articles,
            updatedAt: new Date().toISOString(),
          },
          swapRecord: rec.data.cid,
        });
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
        const rec = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
        });
        const val = rec.data.value as SiteData;
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteSlug,
          record: {
            ...val,
            articles: (val.articles ?? []).filter((a) => a.uri !== uri),
            groups: (val.groups ?? []).map((g) => ({
              ...g,
              articles: (g.articles ?? []).filter((a) => a.uri !== uri),
            })),
            updatedAt: new Date().toISOString(),
          },
          swapRecord: rec.data.cid,
        });
      } catch (err) {
        console.error("Failed to remove article:", err);
      }
    }

    return redirect(`/article/list/${siteSlug}`);
  }

  return redirect(`/article/list/${siteSlug}`);
}

function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [title, setTitle] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isPending = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) {
      onCloseRef.current();
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="_intent" value="createGroup" />
      <Input
        id="group-title"
        name="title"
        label="Group title"
        placeholder="e.g. Engineering"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={fetcher.data?.error}
        autoFocus
      />
      <Button type="submit" disabled={isPending || !title.trim()}>
        {isPending ? "Creating…" : "Proceed"}
      </Button>
    </fetcher.Form>
  );
}

export function HydrateFallback() {
  return <div>Loading…</div>;
}

export default function SiteListView({ loaderData }: Route.ComponentProps) {
  const { site, devMode } = loaderData;
  const { isOpen, open, close } = useModal();

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
      title={site.title}
      topButtons={
        <>
          <Link to="/article/create">
            <Button type="button" variant="primary">
              Draft New Article
            </Button>
          </Link>
          <Button type="button" variant="primary" onClick={open}>
            Add New Group
          </Button>
        </>
      }
    >
      {saveFetcher.data?.error && (
        <p style={{ color: "red" }}>Save failed: {saveFetcher.data.error}</p>
      )}
      {saveFetcher.data?.ok && <p style={{ color: "green" }}>Order saved.</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
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
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save Order"}
        </Button>
      </FooterPortal>

      <Modal
        isOpen={isOpen}
        onClose={close}
        title="Add new group"
        footer={null}
      >
        <CreateGroupModal onClose={close} />
      </Modal>
    </PageContainer>
  );
}
