import type { Route } from "./+types/list";
import { Form, Link, redirect, useFetcher } from "react-router";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { useState, useRef, useEffect } from "react";
import { ArticleItemPreview } from "~/components/ArticleItem/ArticleItem";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
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

const ARTICLE_COLLECTION = "app.scribe.article";
const GROUP_COLLECTION = "app.scribe.group";
const MANIFEST_COLLECTION = "app.scribe.manifest";
const MANIFEST_RKEY = "main";

type Article = {
  uri: string;
  cid: string;
  title: string;
  url: string;
  splashImageUrl: string;
  createdAt: string;
};

type Group = {
  uri: string;
  cid: string;
  title: string;
  slug: string;
};

type ManifestArticleItem = { type: "article"; slug: string };
type ManifestGroupItem = {
  type: "group";
  slug: string;
  title: string;
  children: ManifestArticleItem[];
};
type ManifestItem = ManifestArticleItem | ManifestGroupItem;

// Tree types used in component state
type TreeArticleNode = {
  kind: "article";
  id: string; // "a:{slug}"
  uri: string;
  cid: string;
  title: string;
  createdAt: string;
};

type TreeGroupNode = {
  kind: "group";
  id: string; // "g:{slug}"
  uri: string;
  cid: string;
  title: string;
  slug: string;
  children: TreeArticleNode[];
};


function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function articleId(slug: string) { return `a:${slug}`; }
function groupId(slug: string) { return `g:${slug}`; }
function idToSlug(id: string) { return id.slice(2); }

function articleToNode(article: Article, slug: string): TreeArticleNode {
  return {
    kind: "article",
    id: articleId(slug),
    uri: article.uri,
    cid: article.cid,
    title: article.title,
    createdAt: article.createdAt,
  };
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

function buildTree(
  manifest: ManifestItem[],
  articles: Article[],
  groups: Group[],
): TreeGroupNode[] {
  const articleMap = new Map(articles.map((a) => [a.uri.split("/").pop()!, a]));
  const groupMap = new Map(groups.map((g) => [g.slug, g]));
  const placedArticleSlugs = new Set<string>();
  const placedGroupSlugs = new Set<string>();

  const rootChildren: TreeArticleNode[] = [];
  const namedGroups: TreeGroupNode[] = [];

  for (const item of manifest) {
    if (item.type === "group") {
      const group = groupMap.get(item.slug);
      if (!group) continue;
      placedGroupSlugs.add(item.slug);
      const children: TreeArticleNode[] = [];
      for (const child of item.children) {
        const article = articleMap.get(child.slug);
        if (!article) continue;
        placedArticleSlugs.add(child.slug);
        children.push(articleToNode(article, child.slug));
      }
      namedGroups.push({
        kind: "group",
        id: groupId(item.slug),
        uri: group.uri,
        cid: group.cid,
        title: group.title,
        slug: item.slug,
        children,
      });
    } else {
      const article = articleMap.get(item.slug);
      if (!article) continue;
      placedArticleSlugs.add(item.slug);
      rootChildren.push(articleToNode(article, item.slug));
    }
  }

  for (const group of groups) {
    if (!placedGroupSlugs.has(group.slug)) {
      namedGroups.push({
        kind: "group",
        id: groupId(group.slug),
        uri: group.uri,
        cid: group.cid,
        title: group.title,
        slug: group.slug,
        children: [],
      });
    }
  }

  for (const article of articles) {
    const slug = article.uri.split("/").pop()!;
    if (!placedArticleSlugs.has(slug)) {
      rootChildren.push(articleToNode(article, slug));
    }
  }

  return [
    { kind: "group", id: "g:root", uri: "", cid: "", title: "ROOT", slug: "root", children: rootChildren },
    ...namedGroups,
  ];
}

function treeToManifest(tree: TreeGroupNode[]): ManifestItem[] {
  const result: ManifestItem[] = [];
  for (const node of tree) {
    if (node.id === "g:root") {
      for (const child of node.children) {
        result.push({ type: "article", slug: idToSlug(child.id) } satisfies ManifestArticleItem);
      }
    } else {
      result.push({
        type: "group",
        slug: node.slug,
        title: node.title,
        children: node.children.map((c) => ({ type: "article", slug: idToSlug(c.id) })),
      } satisfies ManifestGroupItem);
    }
  }
  return result;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Articles" }];
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
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
      await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: GROUP_COLLECTION,
        rkey: slug,
        record: {
          $type: GROUP_COLLECTION,
          title,
          children: [],
          createdAt: new Date().toISOString(),
        },
      });
    }

    return redirect("/article/list");
  }

  if (intent === "saveManifest") {
    const manifestJson = formData.get("manifest") as string;
    if (!manifestJson) return { error: "No manifest data." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: MANIFEST_COLLECTION,
          rkey: MANIFEST_RKEY,
          record: {
            $type: MANIFEST_COLLECTION,
            items: JSON.parse(manifestJson),
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error("Failed to save manifest:", err);
        return { error: `Failed to save order: ${String(err)}` };
      }
    }

    return { ok: true };
  }

  if (intent === "deleteGroup") {
    const rkey = formData.get("rkey") as string;
    const cid = formData.get("cid") as string | null;
    if (!rkey) return redirect("/article/list");

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did);
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: GROUP_COLLECTION,
          rkey,
          swapRecord: cid ?? undefined,
        });
      } catch (err) {
        console.error("Failed to delete group:", err);
      }
    }

    return redirect("/article/list");
  }

  // intent === "deleteArticle"
  const rkey = formData.get("rkey") as string;
  const cid = formData.get("cid") as string | null;
  if (!rkey) return redirect("/article/list");

  if (useRealOAuth) {
    const agent = await getAtpAgent(did);
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey,
      swapRecord: cid ?? undefined,
    });
  }

  return redirect("/article/list");
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      devMode: true,
      manifest: [] as ManifestItem[],
      groups: [
        {
          uri: "at://did:dev:user/app.scribe.group/engineering",
          cid: "dev-cid-g1",
          title: "Engineering",
          slug: "engineering",
        },
        {
          uri: "at://did:dev:user/app.scribe.group/design",
          cid: "dev-cid-g2",
          title: "Design",
          slug: "design",
        },
      ] as Group[],
      articles: [
        {
          uri: "at://did:dev:user/app.scribe.article/hello-world",
          cid: "dev-cid-1",
          title: "Hello World",
          url: "hello-world",
          splashImageUrl: "",
          createdAt: new Date("2025-01-01").toISOString(),
        },
        {
          uri: "at://did:dev:user/app.scribe.article/getting-started",
          cid: "dev-cid-2",
          title: "Getting Started with AT Protocol",
          url: "getting-started",
          splashImageUrl: "",
          createdAt: new Date("2025-02-14").toISOString(),
        },
        {
          uri: "at://did:dev:user/app.scribe.article/lexical-editor",
          cid: "dev-cid-3",
          title: "Building a Rich Text Editor with Lexical",
          url: "lexical-editor",
          splashImageUrl: "",
          createdAt: new Date("2025-03-20").toISOString(),
        },
        {
          uri: "at://did:dev:user/app.scribe.article/sqlite-sessions",
          cid: "dev-cid-4",
          title: "Persisting OAuth Sessions with SQLite",
          url: "sqlite-sessions",
          splashImageUrl: "",
          createdAt: new Date("2025-04-05").toISOString(),
        },
      ] as Article[],
    };
  }

  try {
    const agent = await getAtpAgent(did);
    const [articlesResult, groupsResult, manifestResult] = await Promise.all([
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: ARTICLE_COLLECTION,
        limit: 100,
      }),
      agent.com.atproto.repo.listRecords({
        repo: did,
        collection: GROUP_COLLECTION,
        limit: 100,
      }),
      agent.com.atproto.repo
        .getRecord({
          repo: did,
          collection: MANIFEST_COLLECTION,
          rkey: MANIFEST_RKEY,
        })
        .catch(() => null),
    ]);

    const articles: Article[] = articlesResult.data.records.map((record) => ({
      uri: record.uri,
      cid: record.cid,
      title: String(record.value.title ?? "(untitled)"),
      url: String(record.value.url ?? record.uri.split("/").pop() ?? ""),
      splashImageUrl: String(record.value.splashImageUrl ?? ""),
      createdAt: String(record.value.createdAt ?? ""),
    }));

    const groups: Group[] = groupsResult.data.records.map((record) => ({
      uri: record.uri,
      cid: record.cid,
      title: String(record.value.title ?? "(untitled)"),
      slug: record.uri.split("/").pop() ?? "",
    }));

    const manifest: ManifestItem[] =
      (manifestResult?.data.value.items as ManifestItem[]) ?? [];

    return { articles, groups, manifest, devMode: false };
  } catch (err) {
    console.error("Failed to fetch records from PDS:", err);
    return {
      articles: [] as Article[],
      groups: [] as Group[],
      manifest: [] as ManifestItem[],
      devMode: false,
      error: String(err),
    };
  }
}

function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [title, setTitle] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isPending = fetcher.state !== "idle";
  const serverError = fetcher.data?.error;

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
        error={serverError}
        autoFocus
      />
      <Button type="submit" disabled={isPending || !title.trim()}>
        {isPending ? "Creating…" : "Proceed"}
      </Button>
    </fetcher.Form>
  );
}

export default function ListView({ loaderData }: Route.ComponentProps) {
  const { articles, groups, manifest, devMode, error } = loaderData;
  const { isOpen, open, close } = useModal();

  const [tree, setTree] = useState<TreeGroupNode[]>(() =>
    buildTree(manifest, articles, groups),
  );
  const [activeArticle, setActiveArticle] = useState<TreeArticleNode | null>(null);
  const [activeGroup, setActiveGroup] = useState<TreeGroupNode | null>(null);
  const previousTreeRef = useRef<TreeGroupNode[]>(tree);
  const manifestFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isSaving = manifestFetcher.state !== "idle";

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
      setActiveGroup(id !== "g:root" ? (tree.find((n) => n.id === id) ?? null) : null);
      setActiveArticle(null);
    }
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    if (activeId.startsWith("g:")) {
      if (activeId === "g:root" || !overId.startsWith("g:") || overId === "g:root") return;
      setTree((prev) => {
        const sourceIdx = prev.findIndex((n) => n.id === activeId);
        const overIdx = prev.findIndex((n) => n.id === overId);
        if (sourceIdx === -1 || overIdx === -1 || sourceIdx === overIdx) return prev;
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
        if (targetGroupIdx === -1 || targetGroupIdx === srcLoc.groupIdx) return prev;
        if (prev[targetGroupIdx].children.length > 0) return prev;
        return prev.map((group, i) => {
          if (i === srcLoc.groupIdx) return { ...group, children: group.children.filter((_, ci) => ci !== srcLoc.childIdx) };
          if (i === targetGroupIdx) return { ...group, children: [...group.children, activeNode] };
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
              ? { ...group, children: arrayMove(group.children, srcLoc.childIdx, dstLoc.childIdx) }
              : group,
          );
        }
        return prev.map((group, i) => {
          if (i === srcLoc.groupIdx) return { ...group, children: group.children.filter((_, ci) => ci !== srcLoc.childIdx) };
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

  function handleSaveManifest() {
    const manifestData = treeToManifest(tree);
    const formData = new FormData();
    formData.set("_intent", "saveManifest");
    formData.set("manifest", JSON.stringify(manifestData));
    manifestFetcher.submit(formData, { method: "post" });
  }

  return (
    <PageContainer
      title="Articles & Groups"
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
          <Button
            type="button"
            variant="secondary"
            onClick={handleSaveManifest}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save Order"}
          </Button>
        </>
      }
    >
      {error && <p style={{ color: "red" }}>Error loading articles: {error}</p>}
      {manifestFetcher.data?.error && (
        <p style={{ color: "red" }}>
          Save failed: {manifestFetcher.data.error}
        </p>
      )}
      {manifestFetcher.data?.ok && (
        <p style={{ color: "green" }}>Order saved.</p>
      )}

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
                    uri={group.uri}
                    cid={group.cid}
                    title={group.title}
                    slug={group.slug}
                    articleChildren={group.children as TreeArticle[]}
                    isRoot={group.id === "g:root"}
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
              uri={activeGroup.uri}
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
