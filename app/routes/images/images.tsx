import type { Route } from "./+types/images";
import { Link, useRevalidator } from "react-router";
import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { requireAuth, useRealOAuth } from "~/services/auth.server";
import { useToast } from "~/components/Toast/ToastContext";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";
import { UploadModal } from "./UploadModal";
import { NewFolderModal } from "./NewFolderModal";
import { MoveImageModal } from "./MoveImageModal";
import { DeleteImageModal } from "./DeleteImageModal";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { BulkDeleteModal } from "./BulkDeleteModal";
import { BulkMoveModal } from "./BulkMoveModal";
import { AddToNewFolderModal } from "./AddToNewFolderModal";
import { bulkMove, deleteFolder } from "~/services/imageServiceClient";
import { Spinner } from "~/components/Spinner/Spinner";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import styles from "./images.module.css";

type BrowseFolder = {
  id: number;
  user_did: string;
  name: string;
  parent_id: number | null;
  created_at?: string;
};

type BrowseImage = {
  id: number;
  user_did: string;
  filename: string;
  original_name: string;
  width: number;
  height: number;
  sizes: Record<string, { width: number; height: number; bytes?: number }>;
  created_at: string;
};

type UserProfile = {
  displayName: string | null;
  avatarUrl: string | null;
};

type LoaderData = {
  currentUserDid: string;
  folder: BrowseFolder | null;
  breadcrumbs: Array<{ id: number; name: string }>;
  subfolders: BrowseFolder[];
  images: BrowseImage[];
  profiles: Record<string, UserProfile>;
  serviceError?: boolean;
};

const VARIANT_ORDER = ["thumb", "600", "1200", "1800", "max"];
const VARIANT_LABEL: Record<string, string> = {
  thumb: "Thumb",
  "600": "600w",
  "1200": "1200w",
  "1800": "1800w",
  max: "Max",
};

function largestSizeVariant(sizes: BrowseImage["sizes"]): string | null {
  for (let i = VARIANT_ORDER.length - 1; i >= 0; i--) {
    if (VARIANT_ORDER[i] !== "thumb" && VARIANT_ORDER[i] in sizes)
      return VARIANT_ORDER[i];
  }
  return null;
}

const DEV_DID = "did:dev:user";

const DEV_OTHER_DID = "did:plc:otheruser456789abcdefgh";

const DEV_MOCK: LoaderData = {
  currentUserDid: DEV_DID,
  folder: null,
  breadcrumbs: [],
  subfolders: [
    { id: 1, user_did: DEV_DID, name: DEV_DID, parent_id: null },
    { id: 2, user_did: DEV_OTHER_DID, name: DEV_OTHER_DID, parent_id: null },
  ],
  images: [],
  profiles: {
    [DEV_DID]: { displayName: "Dev User", avatarUrl: null },
    [DEV_OTHER_DID]: { displayName: "Another Writer", avatarUrl: null },
  },
};

// Fixture used when a folder query param is present in dev/E2E mode.
// Provides two images large enough that canToggleActual is true in any
// Playwright viewport so fullscreen fit/actual toggle tests work reliably.
const DEV_MOCK_FOLDER: LoaderData = {
  currentUserDid: DEV_DID,
  folder: { id: 1, user_did: DEV_DID, name: DEV_DID, parent_id: null },
  breadcrumbs: [{ id: 1, name: DEV_DID }],
  subfolders: [],
  images: [
    {
      id: 1,
      user_did: DEV_DID,
      filename: "fixture-image-1",
      original_name: "landscape.jpg",
      width: 3000,
      height: 2000,
      sizes: {
        thumb: { width: 300, height: 200, bytes: 15000 },
        max: { width: 3000, height: 2000, bytes: 850000 },
      },
      created_at: "2025-01-15T10:00:00.000Z",
    },
    {
      id: 2,
      user_did: DEV_DID,
      filename: "fixture-image-2",
      original_name: "portrait.jpg",
      width: 1200,
      height: 1600,
      sizes: {
        thumb: { width: 225, height: 300, bytes: 12000 },
        max: { width: 1200, height: 1600, bytes: 420000 },
      },
      created_at: "2025-01-16T10:00:00.000Z",
    },
  ],
  profiles: {
    [DEV_DID]: { displayName: "Dev User", avatarUrl: null },
  },
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Image Library" }];
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    const url = new URL(request.url);
    return url.searchParams.get("folder") ? DEV_MOCK_FOLDER : DEV_MOCK;
  }

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folder");
  const apiUrl = `http://localhost:3009/api/image-service/browse${folderId ? `?folderId=${folderId}` : ""}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Cookie: request.headers.get("Cookie") ?? "" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(`Image Service returned ${response.status}`);
    const data = (await response.json()) as Omit<
      LoaderData,
      "currentUserDid" | "profiles"
    >;

    const profiles: Record<string, UserProfile> = {};
    const didsToResolve = data.folder
      ? [data.folder.user_did]
      : [...new Set(data.subfolders.map((f) => f.user_did))];
    if (didsToResolve.length > 0) {
      const uniqueDids = didsToResolve;
      try {
        const params = new URLSearchParams();
        uniqueDids.forEach((d) => params.append("actors", d));
        const profileRes = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`,
        );
        if (profileRes.ok) {
          const { profiles: fetched } = (await profileRes.json()) as {
            profiles: Array<{
              did: string;
              displayName?: string;
              avatar?: string;
            }>;
          };
          for (const p of fetched) {
            profiles[p.did] = {
              displayName: p.displayName ?? null,
              avatarUrl: p.avatar ?? null,
            };
          }
        }
      } catch {
        // Profile resolution is best-effort; falls back to DID display
      }
    }

    return { ...data, currentUserDid: did, profiles };
  } catch (err) {
    console.error("[images loader]", err);
    return {
      folder: null,
      breadcrumbs: [],
      subfolders: [],
      images: [],
      currentUserDid: did,
      profiles: {},
      serviceError: true,
    } satisfies LoaderData;
  }
}

function thumbUrl(image: BrowseImage): string {
  const variant =
    "thumb" in image.sizes
      ? "thumb"
      : "600" in image.sizes
        ? "600"
        : "1200" in image.sizes
          ? "1200"
          : "max";
  return `/image-storage/${image.user_did}/${image.filename}/${variant}.webp`;
}

function Draggable({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (props: ReturnType<typeof useDraggable>) => React.ReactNode;
}) {
  const draggable = useDraggable({ id, disabled });
  return <>{children(draggable)}</>;
}

function Droppable({
  id,
  children,
}: {
  id: string;
  children: (props: ReturnType<typeof useDroppable>) => React.ReactNode;
}) {
  const droppable = useDroppable({ id });
  return <>{children(droppable)}</>;
}

export default function ImagesRoute({ loaderData }: Route.ComponentProps) {
  const {
    folder,
    breadcrumbs,
    subfolders,
    images,
    currentUserDid,
    profiles,
    serviceError,
  } = loaderData;
  const isEmpty = subfolders.length === 0 && images.length === 0;
  const isOwnTree = folder?.user_did === currentUserDid;

  function folderLabel(sub: BrowseFolder): string {
    if (sub.parent_id !== null) return sub.name;
    if (sub.user_did === currentUserDid) return "My Images";
    const displayName = profiles[sub.user_did]?.displayName;
    if (displayName) return `${displayName} Images`;
    return sub.name.length > 20 ? `${sub.name.slice(0, 20)}…` : sub.name;
  }

  const uploadModal = useModal();
  const newFolderModal = useModal();
  const revalidator = useRevalidator();
  const { addToast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

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

  // ── Multi-select state ──────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const isSelectionMode = selected.size > 0;

  // Clear selection on folder navigation (loaderData change)
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
    function handleOutside(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-tile-split-dropdown]")) {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [openDropdownId]);

  // Ordered list of all item IDs in DOM order (folders first, then images)
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
      // No anchor — treat as a plain toggle
      toggleItem(targetId);
      return;
    }
    const [from, to] =
      anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    const rangeIds = ids.slice(from, to + 1);
    setSelected((prev) => {
      const next = new Set(prev);
      rangeIds.forEach((id) => next.add(id));
      return next;
    });
    // Anchor stays at the original anchor point (not updated on shift-click)
  }

  const handleTileClick = useCallback(
    (id: string, e: React.MouseEvent) => {
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

      // Plain click while in selection mode toggles the item
      if (isSelectionMode) {
        e.preventDefault();
        toggleItem(id);
        return;
      }

      // Plain click outside selection mode — let navigation happen normally for
      // folder tiles; for image tiles there is no navigation so this is a no-op.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSelectionMode, anchorId, selected],
  );

  function handleGridClick(e: React.MouseEvent<HTMLUListElement>) {
    if (e.target === e.currentTarget) {
      setSelected(new Set());
      setAnchorId(null);
    }
  }

  function clearSelection() {
    setSelected(new Set());
    setAnchorId(null);
  }

  // ── Normal action handlers ──────────────────────────────────────────────────

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

  function refresh() {
    revalidator.revalidate();
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

  // ── topButtons content ──────────────────────────────────────────────────────

  const normalTopButtons = (
    <div className={styles.topButtons}>
      {isOwnTree && folder && (
        <Button variant="secondary" type="button" onClick={newFolderModal.open}>
          New Folder
        </Button>
      )}
      <Button type="button" onClick={uploadModal.open}>
        Upload Images
      </Button>
    </div>
  );

  const selectionToolbar = isOwnTree ? (
    <div className={styles.selectionToolbar}>
      <Button
        variant="secondary"
        type="button"
        onClick={() => setBulkMoveOpen(true)}
      >
        Move to
      </Button>
      <Button
        variant="danger"
        type="button"
        onClick={() => setBulkDeleteOpen(true)}
      >
        Delete
      </Button>
      <Button
        variant="secondary"
        type="button"
        onClick={() => setAddToNewFolderOpen(true)}
      >
        Add to New Folder
      </Button>
      <button
        type="button"
        className={styles.clearSelectionButton}
        onClick={clearSelection}
        aria-label="Clear selection"
      >
        <SvgIcon name={SvgImageList.Close} fill="currentColor" />
        {selected.size} selected
      </button>
    </div>
  ) : null;

  const topButtons =
    isOwnTree && isSelectionMode ? selectionToolbar : normalTopButtons;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Image}>
          Image Library
        </PageContainerHeading>
      }
      topButtons={topButtons}
      fixed
    >
      <UploadModal isOpen={uploadModal.isOpen} onClose={handleUploadClose} />

      {isOwnTree && folder && (
        <NewFolderModal
          isOpen={newFolderModal.isOpen}
          parentFolderId={folder.id}
          onClose={newFolderModal.close}
          onSuccess={refresh}
        />
      )}

      {moveImage && (
        <MoveImageModal
          isOpen={true}
          imageId={moveImage.id}
          imageName={moveImage.original_name}
          currentFolderId={folder?.id ?? null}
          onClose={() => setMoveImage(null)}
          onSuccess={() => {
            setMoveImage(null);
            refresh();
          }}
        />
      )}

      {deleteImage && (
        <DeleteImageModal
          isOpen={true}
          imageId={deleteImage.id}
          imageName={deleteImage.original_name}
          onClose={() => setDeleteImage(null)}
          onSuccess={() => {
            setDeleteImage(null);
            refresh();
          }}
        />
      )}

      {previewImage && (
        <ImagePreviewModal
          isOpen={true}
          image={previewImage}
          images={images}
          folder={folder}
          breadcrumbs={breadcrumbs}
          currentUserDid={currentUserDid}
          onClose={() => setPreviewImage(null)}
          onDelete={() => {
            setPreviewImage(null);
            refresh();
          }}
          onMove={() => {
            setPreviewImage(null);
            refresh();
          }}
        />
      )}

      {bulkDeleteOpen &&
        (() => {
          const { imageIds, folderIds } = parseSelection(selected);
          return (
            <BulkDeleteModal
              isOpen={true}
              imageIds={imageIds}
              folderIds={folderIds}
              onClose={() => setBulkDeleteOpen(false)}
              onSuccess={handleBulkDeleteSuccess}
            />
          );
        })()}

      {bulkMoveOpen &&
        (() => {
          const { imageIds, folderIds } = parseSelection(selected);
          return (
            <BulkMoveModal
              isOpen={true}
              imageIds={imageIds}
              folderIds={folderIds}
              currentFolderId={folder?.id ?? null}
              onClose={() => setBulkMoveOpen(false)}
              onSuccess={handleBulkMoveSuccess}
            />
          );
        })()}

      {addToNewFolderOpen &&
        folder &&
        (() => {
          const { imageIds, folderIds } = parseSelection(selected);
          return (
            <AddToNewFolderModal
              isOpen={true}
              imageIds={imageIds}
              folderIds={folderIds}
              currentFolderId={folder.id}
              onClose={() => setAddToNewFolderOpen(false)}
              onSuccess={handleAddToNewFolderSuccess}
            />
          );
        })()}

      <PageSection>
        <nav className={styles.breadcrumbs} aria-label="Folder navigation">
          <Link to="/images" className={styles.breadcrumbLink}>
            Image Library
          </Link>
          {breadcrumbs.map((crumb, i) => {
            const label = crumb.name.startsWith("did:")
              ? crumb.name === currentUserDid
                ? "My Images"
                : `${profiles[crumb.name]?.displayName ?? crumb.name} Images`
              : crumb.name;
            return (
              <span key={crumb.id}>
                <span className={styles.breadcrumbSep}>›</span>
                {i === breadcrumbs.length - 1 ? (
                  <span className={styles.breadcrumbCurrent}>{label}</span>
                ) : (
                  <Link
                    to={`/images?folder=${crumb.id}`}
                    className={styles.breadcrumbLink}
                  >
                    {label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </PageSection>

      <PageSection overflow>
        {serviceError && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>
              Image Service unavailable
            </p>
            <p className={styles.emptyStateBody}>
              The Image Service did not respond in time. Make sure it is running
              and try again.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={refresh}
              disabled={revalidator.state !== "idle"}
            >
              {revalidator.state !== "idle" ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}

        {!serviceError && !folder && isEmpty && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>No images yet</p>
            <p className={styles.emptyStateBody}>
              Upload your first image to create your Image Library folder.
            </p>
          </div>
        )}

        {!serviceError && folder && isEmpty && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>This folder is empty</p>
            <p className={styles.emptyStateBody}>
              Upload images or create subfolders to organise your library.
            </p>
          </div>
        )}

        {deleteError && <p className={styles.deleteError}>{deleteError}</p>}

        {(subfolders.length > 0 || images.length > 0) && (
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <ul className={styles.grid} onClick={handleGridClick}>
              {subfolders.map((subfolder) => {
                const avatarUrl =
                  subfolder.parent_id === null
                    ? (profiles[subfolder.user_did]?.avatarUrl ?? null)
                    : null;
                const itemId = `f:${subfolder.id}`;
                const isSelected = selected.has(itemId);
                const isDeleting = confirmDeleteId === subfolder.id;
                return (
                  <li key={`f-${subfolder.id}`}>
                    {isDeleting ? (
                      <div className={styles.deleteConfirm}>
                        <span>Delete &ldquo;{subfolder.name}&rdquo;?</span>
                        <div className={styles.deleteConfirmActions}>
                          <Button
                            variant="danger"
                            type="button"
                            onClick={() => handleDeleteFolder(subfolder.id)}
                          >
                            Delete
                          </Button>
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              setDeleteError(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Droppable id={`drop-f:${subfolder.id}`}>
                        {(droppable) => (
                          <Draggable id={itemId} disabled={isDeleting}>
                            {(draggable) => (
                              <div
                                ref={(node) => {
                                  draggable.setNodeRef(node);
                                  droppable.setNodeRef(node);
                                }}
                                {...draggable.attributes}
                                {...draggable.listeners}
                                className={`${styles.folderTileWrap}${isSelected ? ` ${styles.tileWrapSelected}` : ""}${droppable.isOver ? ` ${styles.folderTileDragOver}` : ""}${draggable.isDragging ? ` ${styles.tileIsDragging}` : ""}`}
                              >
                                {isOwnTree && (
                                  <input
                                    type="checkbox"
                                    className={`${styles.tileCheckbox}${isSelectionMode ? ` ${styles.tileCheckboxVisible}` : ""}`}
                                    checked={isSelected}
                                    aria-label={`Select ${subfolder.name}`}
                                    onChange={() => toggleItem(itemId)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                                <Link
                                  to={`/images?folder=${subfolder.id}`}
                                  className={`${styles.folderTile}${subfolder.parent_id === null && subfolder.user_did === currentUserDid ? ` ${styles.folderTileOwn}` : ""}${isSelected ? ` ${styles.tileSelected}` : ""}`}
                                  onClick={(e) => {
                                    handleTileClick(itemId, e);
                                    // If we consumed the click for selection, prevent navigation
                                    const isCtrl = e.ctrlKey || e.metaKey;
                                    const isShift = e.shiftKey;
                                    if (isCtrl || isShift || isSelectionMode) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }
                                  }}
                                >
                                  <span className={styles.folderIcon}>
                                    <SvgIcon
                                      name={SvgImageList.Folder}
                                      fill="var(--action-primary)"
                                    />
                                    {avatarUrl && (
                                      <img
                                        src={avatarUrl}
                                        alt=""
                                        className={styles.folderAvatar}
                                      />
                                    )}
                                  </span>
                                  <span className={styles.tileName}>
                                    {folderLabel(subfolder)}
                                  </span>
                                </Link>
                                {isOwnTree && (
                                  <div className={styles.tileActions}>
                                    <button
                                      type="button"
                                      className={`${styles.tileAction} ${styles.tileActionDanger}`}
                                      onClick={() => {
                                        setConfirmDeleteId(subfolder.id);
                                        setDeleteError(null);
                                      }}
                                      aria-label={`Delete ${subfolder.name}`}
                                      title="Delete folder"
                                    >
                                      <SvgIcon
                                        name={SvgImageList.Trash}
                                        fill="currentColor"
                                      />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        )}
                      </Droppable>
                    )}
                  </li>
                );
              })}

              {images.map((image) => {
                const hasThumb = "thumb" in image.sizes;
                const sizeVariants = VARIANT_ORDER.filter(
                  (v) => v !== "thumb" && v in image.sizes,
                );
                const splitVariant =
                  tileSplitVariants[image.id] ??
                  largestSizeVariant(image.sizes);
                const isDropdownOpen = openDropdownId === image.id;
                const itemId = `i:${image.id}`;
                const isSelected = selected.has(itemId);
                return (
                  <li key={`i-${image.id}`}>
                    <Draggable id={itemId}>
                      {(draggable) => (
                        <div
                          ref={draggable.setNodeRef}
                          {...draggable.attributes}
                          {...draggable.listeners}
                          className={`${styles.imageTileWrap}${isSelected ? ` ${styles.tileWrapSelected}` : ""}${draggable.isDragging ? ` ${styles.tileIsDragging}` : ""}`}
                          onClick={(e) => handleTileClick(itemId, e)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(image);
                          }}
                        >
                          {isOwnTree && (
                            <input
                              type="checkbox"
                              className={`${styles.tileCheckbox}${isSelectionMode ? ` ${styles.tileCheckboxVisible}` : ""}`}
                              checked={isSelected}
                              aria-label={`Select ${image.original_name}`}
                              onChange={() => toggleItem(itemId)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <div
                            className={`${styles.imageTile}${isSelected ? ` ${styles.tileSelected}` : ""}`}
                          >
                            <span className={styles.thumbnailWrap}>
                              <img
                                src={thumbUrl(image)}
                                alt={image.original_name}
                                className={styles.thumbnail}
                                loading="lazy"
                              />
                            </span>
                            <span
                              className={styles.tileName}
                              title={image.original_name}
                            >
                              {image.original_name}
                            </span>
                            <div className={styles.variantButtons}>
                              {hasThumb && (
                                <button
                                  type="button"
                                  className={`${styles.variantButton}${copiedKey === `${image.id}:thumb` ? ` ${styles.variantButtonCopied}` : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopy(image, "thumb");
                                  }}
                                  title="Copy Thumb URL"
                                >
                                  {copiedKey === `${image.id}:thumb`
                                    ? "✓"
                                    : "Thumb"}
                                </button>
                              )}
                              {splitVariant && (
                                <div
                                  className={styles.tileSplitButton}
                                  data-tile-split-dropdown
                                >
                                  <button
                                    type="button"
                                    className={`${styles.tileSplitButtonMain}${copiedKey === `${image.id}:${splitVariant}` ? ` ${styles.variantButtonCopied}` : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopy(image, splitVariant);
                                    }}
                                    title={`Copy ${VARIANT_LABEL[splitVariant] ?? splitVariant} URL`}
                                  >
                                    {copiedKey === `${image.id}:${splitVariant}`
                                      ? "✓"
                                      : (VARIANT_LABEL[splitVariant] ??
                                        splitVariant)}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.tileSplitButtonChevron}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId((prev) =>
                                        prev === image.id ? null : image.id,
                                      );
                                    }}
                                    aria-label="Select size variant"
                                  >
                                    ▾
                                  </button>
                                  {isDropdownOpen && (
                                    <div className={styles.tileSplitDropdown}>
                                      {sizeVariants.map((v) => (
                                        <button
                                          key={v}
                                          type="button"
                                          className={`${styles.tileSplitDropdownItem}${v === splitVariant ? ` ${styles.tileSplitDropdownItemActive}` : ""}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setTileSplitVariants((prev) => ({
                                              ...prev,
                                              [image.id]: v,
                                            }));
                                            setOpenDropdownId(null);
                                          }}
                                        >
                                          {VARIANT_LABEL[v] ?? v}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          {isOwnTree && (
                            <div className={styles.tileActions}>
                              <button
                                type="button"
                                className={styles.tileAction}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMoveImage(image);
                                }}
                                aria-label={`Move ${image.original_name}`}
                                title="Move to folder"
                              >
                                <SvgIcon name={SvgImageList.Folder} />
                              </button>
                              <button
                                type="button"
                                className={`${styles.tileAction} ${styles.tileActionDanger}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteImage(image);
                                }}
                                aria-label={`Delete ${image.original_name}`}
                                title="Delete image"
                              >
                                <SvgIcon name={SvgImageList.Trash} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  </li>
                );
              })}
            </ul>

            <DragOverlay>
              {activeId
                ? (() => {
                    const isMoveAll =
                      selected.has(activeId) && selected.size > 1;
                    if (isMoveAll) {
                      return (
                        <div className={styles.dragBadge}>
                          {selected.size} items
                        </div>
                      );
                    }
                    const label = activeId.startsWith("i:")
                      ? (images.find((img) => `i:${img.id}` === activeId)
                          ?.original_name ?? activeId)
                      : (subfolders.find((f) => `f:${f.id}` === activeId)
                          ?.name ?? activeId);
                    return <div className={styles.dragBadge}>{label}</div>;
                  })()
                : null}
            </DragOverlay>
          </DndContext>
        )}
      </PageSection>
    </PageContainer>
  );
}
