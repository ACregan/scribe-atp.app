import { useState, useRef, type Dispatch, type SetStateAction } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { TreeArticleNode, TreeGroupNode } from "./siteTree";

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

export function useSiteListDnD(
  tree: TreeGroupNode[],
  setTree: Dispatch<SetStateAction<TreeGroupNode[]>>,
) {
  const [activeArticle, setActiveArticle] = useState<TreeArticleNode | null>(
    null,
  );
  const [activeGroup, setActiveGroup] = useState<TreeGroupNode | null>(null);
  const previousTreeRef = useRef<TreeGroupNode[]>(tree);
  // Deferred target for dropping an article into an empty group.
  // Moving the active item between SortableContexts during onDragOver unmounts
  // and remounts the draggable component, causing dnd-kit to lose its DOM
  // reference. We track the intended group here and apply the move in onDragEnd.
  const pendingEmptyGroupRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function onDragStart({ active }: DragStartEvent) {
    previousTreeRef.current = tree;
    pendingEmptyGroupRef.current = null;
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
        if (
          targetGroupIdx === -1 ||
          targetGroupIdx === srcLoc.groupIdx ||
          prev[targetGroupIdx].children.length > 0
        ) {
          pendingEmptyGroupRef.current = null;
          return prev;
        }
        // Defer the move to onDragEnd — moving the active item between
        // SortableContexts during onDragOver unmounts/remounts it while it is
        // still the active draggable, causing dnd-kit to lose its DOM reference.
        pendingEmptyGroupRef.current = overId;
        return prev;
      }

      // Hovering over an article clears any pending empty-group target.
      pendingEmptyGroupRef.current = null;

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

  function onDragEnd({ over, active }: DragEndEvent) {
    const pendingGroupId = pendingEmptyGroupRef.current;
    pendingEmptyGroupRef.current = null;

    if (!over) {
      setTree(previousTreeRef.current);
      setActiveArticle(null);
      setActiveGroup(null);
      return;
    }

    if (pendingGroupId) {
      const activeId = String(active.id);
      setTree((prev) => {
        const srcLoc = findArticleLocation(prev, activeId);
        if (!srcLoc) return prev;
        const activeNode = prev[srcLoc.groupIdx].children[srcLoc.childIdx];
        const targetGroupIdx = prev.findIndex((n) => n.id === pendingGroupId);
        if (
          targetGroupIdx === -1 ||
          targetGroupIdx === srcLoc.groupIdx ||
          prev[targetGroupIdx].children.length > 0
        )
          return prev;
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
      });
    }

    setActiveArticle(null);
    setActiveGroup(null);
  }

  return {
    sensors,
    activeArticle,
    activeGroup,
    onDragStart,
    onDragOver,
    onDragEnd,
  };
}
