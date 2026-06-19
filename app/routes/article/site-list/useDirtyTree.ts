import { useState, useRef, useMemo, useEffect } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import type { SiteGroup } from "~/hooks/types";
import {
  buildTreeFromSite,
  groupId,
  type SiteManifest,
  type TreeGroupNode,
} from "./siteTree";

export function useDirtyTree(site: SiteManifest) {
  const { addToast } = useToast();

  const [tree, setTree] = useState<TreeGroupNode[]>(() =>
    buildTreeFromSite(site),
  );
  const [savedTree, setSavedTree] = useState<TreeGroupNode[]>(() =>
    buildTreeFromSite(site),
  );

  // Tracks which group slugs are in the tree so we can detect ones added
  // server-side after a createGroup action revalidates the loader.
  const knownGroupSlugsRef = useRef<Set<string>>(
    new Set(site.groups.map((g) => g.slug)),
  );

  const isDirty = useMemo(
    () => JSON.stringify(tree) !== JSON.stringify(savedTree),
    [tree, savedTree],
  );

  // Sync newly-created groups from the loader into both tree and savedTree so
  // a freshly persisted group doesn't register as an unsaved local change.
  useEffect(() => {
    const newGroups = site.groups.filter(
      (g: SiteGroup) => !knownGroupSlugsRef.current.has(g.slug),
    );
    if (newGroups.length === 0) return;

    newGroups.forEach((g: SiteGroup) => knownGroupSlugsRef.current.add(g.slug));

    const newNodes: TreeGroupNode[] = newGroups.map((g: SiteGroup) => ({
      kind: "group",
      id: groupId(g.slug),
      slug: g.slug,
      title: g.title,
      children: [],
    }));

    setTree((prev) => [...prev, ...newNodes]);
    setSavedTree((prev) => [...prev, ...newNodes]);

    if (newGroups.length === 1) {
      addToast({
        heading: "Group created",
        content: newGroups[0].title,
        variant: "success",
      });
    } else {
      addToast({
        heading: `${newGroups.length} groups added`,
        variant: "success",
      });
    }
  }, [site.groups]); // eslint-disable-line react-hooks/exhaustive-deps

  function markSaved() {
    setSavedTree(tree);
  }

  function removeGroup(slug: string) {
    knownGroupSlugsRef.current.delete(slug);
    setTree((prev) => prev.filter((g) => g.slug !== slug));
    setSavedTree((prev) => prev.filter((g) => g.slug !== slug));
  }

  return { tree, setTree, savedTree, isDirty, markSaved, removeGroup };
}
