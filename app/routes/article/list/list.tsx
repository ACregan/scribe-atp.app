import type { Route } from "./+types/list";
import { Form, Link, redirect, useFetcher } from "react-router";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { useState, useRef, useCallback, useEffect } from "react";
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

type TreeNode = TreeArticleNode | TreeGroupNode;

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function buildTree(
  manifest: ManifestItem[],
  articles: Article[],
  groups: Group[]
): TreeNode[] {
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
        children.push({
          kind: "article",
          id: `a:${child.slug}`,
          uri: article.uri,
          cid: article.cid,
          title: article.title,
          createdAt: article.createdAt,
        });
      }
      namedGroups.push({
        kind: "group",
        id: `g:${item.slug}`,
        uri: group.uri,
        cid: group.cid,
        title: group.title,
        slug: item.slug,
        children,
      });
    } else {
      // Root-level manifest article → goes into ROOT
      const article = articleMap.get(item.slug);
      if (!article) continue;
      placedArticleSlugs.add(item.slug);
      rootChildren.push({
        kind: "article",
        id: `a:${item.slug}`,
        uri: article.uri,
        cid: article.cid,
        title: article.title,
        createdAt: article.createdAt,
      });
    }
  }

  // Unmanifested named groups
  for (const group of groups) {
    if (!placedGroupSlugs.has(group.slug)) {
      namedGroups.push({
        kind: "group",
        id: `g:${group.slug}`,
        uri: group.uri,
        cid: group.cid,
        title: group.title,
        slug: group.slug,
        children: [],
      });
    }
  }

  // Unmanifested articles → ROOT
  for (const article of articles) {
    const slug = article.uri.split("/").pop()!;
    if (!placedArticleSlugs.has(slug)) {
      rootChildren.push({
        kind: "article",
        id: `a:${slug}`,
        uri: article.uri,
        cid: article.cid,
        title: article.title,
        createdAt: article.createdAt,
      });
    }
  }

  const rootGroup: TreeGroupNode = {
    kind: "group",
    id: "g:root",
    uri: "",
    cid: "",
    title: "ROOT",
    slug: "root",
    children: rootChildren,
  };

  return [rootGroup, ...namedGroups];
}

function treeToManifest(tree: TreeNode[]): ManifestItem[] {
  const result: ManifestItem[] = [];
  for (const node of tree) {
    if (node.kind !== "group") continue;
    if (node.id === "g:root") {
      // ROOT's children serialise as root-level manifest articles
      for (const child of node.children) {
        result.push({ type: "article", slug: child.id.slice(2) } satisfies ManifestArticleItem);
      }
    } else {
      result.push({
        type: "group",
        slug: node.slug,
        title: node.title,
        children: node.children.map((c) => ({
          type: "article",
          slug: c.id.slice(2),
        })),
      } satisfies ManifestGroupItem);
    }
  }
  return result;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Articles" }];
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
    }

    return { ok: true };
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

  const [tree, setTree] = useState<TreeNode[]>(() =>
    buildTree(manifest, articles, groups)
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const previousTreeRef = useRef<TreeNode[]>(tree);
  const manifestFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isSaving = manifestFetcher.state !== "idle";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const rootIds = tree.map((n) => n.id);

  const findArticleNode = useCallback(
    (id: string): TreeArticleNode | undefined => {
      for (const node of tree) {
        if (node.kind === "article" && node.id === id) return node;
        if (node.kind === "group") {
          const child = node.children.find((c) => c.id === id);
          if (child) return child;
        }
      }
    },
    [tree]
  );

  const activeArticle = activeId?.startsWith("a:")
    ? findArticleNode(activeId)
    : null;
  const activeGroup = activeId?.startsWith("g:")
    ? (tree.find((n) => n.id === activeId) as TreeGroupNode | undefined)
    : null;

  function onDragStart({ active }: DragStartEvent) {
    previousTreeRef.current = tree;
    setActiveId(String(active.id));
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // Group dragging: ROOT is fixed, named groups sort among themselves
    if (activeId.startsWith("g:")) {
      if (activeId === "g:root" || !overId.startsWith("g:") || overId === "g:root") return;
      setTree((prev) => {
        const sourceIdx = prev.findIndex((n) => n.id === activeId);
        const overIdx = prev.findIndex((n) => n.id === overId);
        if (sourceIdx === -1 || overIdx === -1) return prev;
        return arrayMove(prev, sourceIdx, overIdx);
      });
      return;
    }

    // Article dragging — all articles live inside a group (including ROOT)
    if (!activeId.startsWith("a:")) return;

    setTree((prev) => {
      const next = prev.map((n) =>
        n.kind === "group" ? { ...n, children: [...n.children] } : { ...n }
      ) as TreeNode[];

      // Locate the active article
      let sourceGroupIdx = -1;
      let sourceChildIdx = -1;
      for (let i = 0; i < next.length; i++) {
        const node = next[i];
        if (node.kind === "group") {
          const ci = node.children.findIndex((c) => c.id === activeId);
          if (ci !== -1) { sourceGroupIdx = i; sourceChildIdx = ci; break; }
        }
      }
      if (sourceGroupIdx === -1) return prev;

      const activeNode = (next[sourceGroupIdx] as TreeGroupNode).children[sourceChildIdx];

      // Drop over empty-group droppable zone "drop:g:{slug}"
      if (overId.startsWith("drop:g:")) {
        const targetGroupId = overId.slice(5);
        const targetGroupIdx = next.findIndex((n) => n.id === targetGroupId);
        if (targetGroupIdx === -1) return prev;
        if ((next[targetGroupIdx] as TreeGroupNode).children.some((c) => c.id === activeId)) return prev;
        (next[sourceGroupIdx] as TreeGroupNode).children.splice(sourceChildIdx, 1);
        (next[targetGroupIdx] as TreeGroupNode).children.push(activeNode);
        return next;
      }

      // Drop over another article
      if (overId.startsWith("a:")) {
        let overGroupIdx = -1;
        let overChildIdx = -1;
        for (let i = 0; i < next.length; i++) {
          const node = next[i];
          if (node.kind === "group") {
            const ci = node.children.findIndex((c) => c.id === overId);
            if (ci !== -1) { overGroupIdx = i; overChildIdx = ci; break; }
          }
        }
        if (overGroupIdx === -1) return prev;

        if (sourceGroupIdx === overGroupIdx) {
          // Reorder within the same group
          (next[sourceGroupIdx] as TreeGroupNode).children = arrayMove(
            (next[sourceGroupIdx] as TreeGroupNode).children,
            sourceChildIdx,
            overChildIdx
          );
        } else {
          // Move to a different group
          (next[sourceGroupIdx] as TreeGroupNode).children.splice(sourceChildIdx, 1);
          (next[overGroupIdx] as TreeGroupNode).children.splice(overChildIdx, 0, activeNode);
        }
        return next;
      }

      return prev;
    });
  }

  function onDragEnd({ over }: DragEndEvent) {
    if (!over) {
      setTree(previousTreeRef.current);
    }
    setActiveId(null);
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
        <p style={{ color: "red" }}>Save failed: {manifestFetcher.data.error}</p>
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
              {tree
                .filter((n): n is TreeGroupNode => n.kind === "group")
                .map((group) => (
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
