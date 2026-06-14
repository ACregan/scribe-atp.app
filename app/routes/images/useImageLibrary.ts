import { useState, useEffect, useCallback } from "react";
import type { MouseEvent, Dispatch, SetStateAction } from "react";
import { useRevalidator } from "react-router";
import {
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useModal } from "~/components/Modal/useModal";
import { useToast } from "~/components/Toast/ToastContext";
import { bulkMove, deleteFolder } from "~/services/imageServiceClient";
import {
  type BrowseFolder,
  type BrowseImage,
  VARIANT_LABEL,
} from "~/components/ImagePickerModal/imageBrowserTypes";

export type UserProfile = {
  displayName: string | null;
  avatarUrl: string | null;
};

type Params = {
  folder: BrowseFolder | null;
  subfolders: BrowseFolder[];
  images: BrowseImage[];
  currentUserDid: string;
  profiles: Record<string, UserProfile>;
};

export function useImageLibrary({
  folder,
  subfolders,
  images,
  currentUserDid,
  profiles,
}: Params) {
  const uploadModal = useModal();
  const newFolderModal = useModal();
  const revalidator = useRevalidator();
  const { addToast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moveImage, setMoveImage] = useState<BrowseImage | null>(null);
  const [deleteImage, setDeleteImage] = useState<BrowseImage | null>(null);
  const [previewImage, setPreviewImage] = useState<BrowseImage | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [tileSplitVariants, setTileSplitVariants] = useState<
    Record<number, string>
  >({});
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [addToNewFolderOpen, setAddToNewFolderOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const isSelectionMode = selected.size > 0;
  const isOwnTree = folder?.user_did === currentUserDid;
  const isEmpty = subfolders.length === 0 && images.length === 0;

  // Clear selection on folder navigation
  useEffect(() => {
    setSelected(new Set());
    setAnchorId(null);
  }, [folder?.id]);

  // Escape key clears selection
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isSelectionMode) {
        setSelected(new Set());
        setAnchorId(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSelectionMode]);

  // Close tile split dropdown on outside click
  useEffect(() => {
    if (openDropdownId === null) return;
    function handleOutside(e: globalThis.MouseEvent) {
      if (!(e.target as Element).closest("[data-tile-split-dropdown]")) {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [openDropdownId]);

  function folderLabel(sub: BrowseFolder): string {
    if (sub.parent_id !== null) return sub.name;
    if (sub.user_did === currentUserDid) return "My Images";
    const displayName = profiles[sub.user_did]?.displayName;
    if (displayName) return `${displayName} Images`;
    return sub.name.length > 20 ? `${sub.name.slice(0, 20)}…` : sub.name;
  }

  function allItemIds(): string[] {
    return [
      ...subfolders.map((f) => `f:${f.id}`),
      ...images.map((i) => `i:${i.id}`),
    ];
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setAnchorId(id);
  }

  function selectRange(targetId: string) {
    const ids = allItemIds();
    const anchorIdx = anchorId !== null ? ids.indexOf(anchorId) : -1;
    const targetIdx = ids.indexOf(targetId);
    if (anchorIdx === -1) {
      toggleItem(targetId);
      return;
    }
    const [from, to] =
      anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    setSelected((prev) => {
      const next = new Set(prev);
      ids.slice(from, to + 1).forEach((id) => next.add(id));
      return next;
    });
    // Anchor stays at the original anchor point (not updated on shift-click)
  }

  const handleTileClick = useCallback(
    (id: string, e: MouseEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      if (isShift && isSelectionMode) {
        e.preventDefault();
        selectRange(id);
        return;
      }
      if (isCtrl) {
        e.preventDefault();
        toggleItem(id);
        return;
      }
      if (isSelectionMode) {
        e.preventDefault();
        toggleItem(id);
        return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSelectionMode, anchorId, selected],
  );

  function handleGridClick(e: MouseEvent<HTMLUListElement>) {
    if (e.target === e.currentTarget) {
      setSelected(new Set());
      setAnchorId(null);
    }
  }

  function clearSelection() {
    setSelected(new Set());
    setAnchorId(null);
  }

  function parseSelection(sel: Set<string>): {
    imageIds: number[];
    folderIds: number[];
  } {
    const imageIds: number[] = [];
    const folderIds: number[] = [];
    for (const id of sel) {
      if (id.startsWith("i:")) imageIds.push(Number(id.slice(2)));
      else if (id.startsWith("f:")) folderIds.push(Number(id.slice(2)));
    }
    return { imageIds, folderIds };
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("drop-f:")) return;
    const destFolderId = Number(overId.slice("drop-f:".length));

    const dragged = String(active.id);
    const isMoveSelection = selected.has(dragged);
    const itemSet = isMoveSelection ? selected : new Set([dragged]);
    const imageIds = [...itemSet]
      .filter((id) => id.startsWith("i:"))
      .map((id) => Number(id.slice(2)));
    const folderIds = [...itemSet]
      .filter((id) => id.startsWith("f:"))
      .map((id) => Number(id.slice(2)));

    if (imageIds.length === 0 && folderIds.length === 0) return;

    bulkMove(imageIds, folderIds, destFolderId)
      .then(() => {
        if (isMoveSelection) clearSelection();
        refresh();
      })
      .catch((err: unknown) => {
        addToast({
          heading: "Move failed",
          content: err instanceof Error ? err.message : "An error occurred",
          variant: "danger",
          autoExpire: false,
        });
      });
  }

  function onDragCancel() {
    setActiveId(null);
  }

  function refresh() {
    revalidator.revalidate();
  }

  function handleUploadClose() {
    uploadModal.close();
    refresh();
  }

  async function handleDeleteFolder(folderId: number) {
    setDeleteError(null);
    try {
      await deleteFolder(folderId);
      setConfirmDeleteId(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function handleCopy(image: BrowseImage, variant: string) {
    const url = `${window.location.origin}/image-storage/${image.user_did}/${image.filename}/${variant}.webp`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        const key = `${image.id}:${variant}`;
        setCopiedKey(key);
        setTimeout(
          () => setCopiedKey((prev) => (prev === key ? null : prev)),
          2000,
        );
        addToast({
          heading: "URL copied to clipboard",
          content: `${image.original_name} — ${VARIANT_LABEL[variant] ?? variant}`,
          variant: "primary",
          expireTimeSeconds: 10,
        });
      })
      .catch(() => {
        /* clipboard denied — no visual change */
      });
  }

  function handleBulkDeleteSuccess() {
    setBulkDeleteOpen(false);
    clearSelection();
    refresh();
  }

  function handleBulkMoveSuccess() {
    setBulkMoveOpen(false);
    clearSelection();
    refresh();
  }

  function handleAddToNewFolderSuccess() {
    setAddToNewFolderOpen(false);
    clearSelection();
    refresh();
  }

  return {
    // Modals
    uploadModal,
    newFolderModal,
    moveImage,
    setMoveImage,
    deleteImage,
    setDeleteImage,
    previewImage,
    setPreviewImage,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    bulkMoveOpen,
    setBulkMoveOpen,
    addToNewFolderOpen,
    setAddToNewFolderOpen,
    // Folder delete
    confirmDeleteId,
    setConfirmDeleteId: setConfirmDeleteId as Dispatch<SetStateAction<number | null>>,
    deleteError,
    setDeleteError: setDeleteError as Dispatch<SetStateAction<string | null>>,
    // Copy / split button
    copiedKey,
    tileSplitVariants,
    setTileSplitVariants,
    openDropdownId,
    setOpenDropdownId,
    // Selection
    selected,
    isSelectionMode,
    // DnD
    activeId,
    sensors,
    // Derived
    isEmpty,
    isOwnTree,
    // Handlers
    folderLabel,
    toggleItem,
    clearSelection,
    handleTileClick,
    handleGridClick,
    parseSelection,
    onDragStart,
    onDragEnd,
    onDragCancel,
    handleUploadClose,
    handleDeleteFolder,
    handleCopy,
    handleBulkDeleteSuccess,
    handleBulkMoveSuccess,
    handleAddToNewFolderSuccess,
    // Revalidator
    revalidator,
    refresh,
  };
}
