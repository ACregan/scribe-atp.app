import type { Dispatch, MouseEvent, SetStateAction } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Link } from "react-router";
import { Button } from "~/components/Button/Button";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import {
  type BrowseFolder,
  type BrowseImage,
  VARIANT_ORDER,
  VARIANT_LABEL,
  thumbUrl,
  largestSizeVariant,
} from "~/components/ImagePickerModal/imageBrowserTypes";
import type { UserProfile } from "./useImageLibrary";
import styles from "./images.module.css";

// ── Utility wrappers ──────────────────────────────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

export type ImageGridProps = {
  subfolders: BrowseFolder[];
  images: BrowseImage[];
  currentUserDid: string;
  profiles: Record<string, UserProfile>;
  isOwnTree: boolean;
  folderLabel: (sub: BrowseFolder) => string;

  // Selection
  selected: Set<string>;
  isSelectionMode: boolean;
  onTileClick: (id: string, e: MouseEvent) => void;
  onGridClick: (e: MouseEvent<HTMLUListElement>) => void;
  onToggleItem: (id: string) => void;

  // DnD
  sensors: ReturnType<typeof useSensors>;
  activeId: string | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;

  // Folder delete
  confirmDeleteId: number | null;
  deleteError: string | null;
  onSetConfirmDeleteId: Dispatch<SetStateAction<number | null>>;
  onSetDeleteError: Dispatch<SetStateAction<string | null>>;
  onDeleteFolder: (id: number) => Promise<void>;

  // Image tile state
  copiedKey: string | null;
  tileSplitVariants: Record<number, string>;
  openDropdownId: number | null;
  onCopy: (image: BrowseImage, variant: string) => void;
  onSetTileSplitVariants: Dispatch<SetStateAction<Record<number, string>>>;
  onSetOpenDropdownId: Dispatch<SetStateAction<number | null>>;
  onSetMoveImage: (img: BrowseImage) => void;
  onSetDeleteImage: (img: BrowseImage) => void;
  onSetPreviewImage: (img: BrowseImage) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ImageGrid({
  subfolders,
  images,
  currentUserDid,
  profiles,
  isOwnTree,
  folderLabel,
  selected,
  isSelectionMode,
  onTileClick,
  onGridClick,
  onToggleItem,
  sensors,
  activeId,
  onDragStart,
  onDragEnd,
  onDragCancel,
  confirmDeleteId,
  deleteError,
  onSetConfirmDeleteId,
  onSetDeleteError,
  onDeleteFolder,
  copiedKey,
  tileSplitVariants,
  openDropdownId,
  onCopy,
  onSetTileSplitVariants,
  onSetOpenDropdownId,
  onSetMoveImage,
  onSetDeleteImage,
  onSetPreviewImage,
}: ImageGridProps) {
  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {deleteError && <p className={styles.deleteError}>{deleteError}</p>}

      <ul className={styles.grid} onClick={onGridClick}>
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
                      onClick={() => onDeleteFolder(subfolder.id)}
                    >
                      Delete
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => {
                        onSetConfirmDeleteId(null);
                        onSetDeleteError(null);
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
                              onChange={() => onToggleItem(itemId)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <Link
                            to={`/images?folder=${subfolder.id}`}
                            className={`${styles.folderTile}${subfolder.parent_id === null && subfolder.user_did === currentUserDid ? ` ${styles.folderTileOwn}` : ""}${isSelected ? ` ${styles.tileSelected}` : ""}`}
                            onClick={(e) => {
                              onTileClick(itemId, e);
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
                                  onSetConfirmDeleteId(subfolder.id);
                                  onSetDeleteError(null);
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
            tileSplitVariants[image.id] ?? largestSizeVariant(image.sizes);
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
                    onClick={(e) => onTileClick(itemId, e)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSetPreviewImage(image);
                    }}
                  >
                    {isOwnTree && (
                      <input
                        type="checkbox"
                        className={`${styles.tileCheckbox}${isSelectionMode ? ` ${styles.tileCheckboxVisible}` : ""}`}
                        checked={isSelected}
                        aria-label={`Select ${image.original_name}`}
                        onChange={() => onToggleItem(itemId)}
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
                              onCopy(image, "thumb");
                            }}
                            title="Copy Thumb URL"
                          >
                            {copiedKey === `${image.id}:thumb` ? "✓" : "Thumb"}
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
                                onCopy(image, splitVariant);
                              }}
                              title={`Copy ${VARIANT_LABEL[splitVariant] ?? splitVariant} URL`}
                            >
                              {copiedKey === `${image.id}:${splitVariant}`
                                ? "✓"
                                : (VARIANT_LABEL[splitVariant] ?? splitVariant)}
                            </button>
                            <button
                              type="button"
                              className={styles.tileSplitButtonChevron}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetOpenDropdownId((prev) =>
                                  prev === image.id ? null : image.id,
                                );
                              }}
                              aria-label="Select size variant"
                              title="Select Size"
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
                                      onSetTileSplitVariants((prev) => ({
                                        ...prev,
                                        [image.id]: v,
                                      }));
                                      onSetOpenDropdownId(null);
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
                            onSetMoveImage(image);
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
                            onSetDeleteImage(image);
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
              const isMoveAll = selected.has(activeId) && selected.size > 1;
              if (isMoveAll) {
                return (
                  <div className={styles.dragBadge}>{selected.size} items</div>
                );
              }
              const label = activeId.startsWith("i:")
                ? (images.find((img) => `i:${img.id}` === activeId)
                    ?.original_name ?? activeId)
                : (subfolders.find((f) => `f:${f.id}` === activeId)?.name ??
                  activeId);
              return <div className={styles.dragBadge}>{label}</div>;
            })()
          : null}
      </DragOverlay>
    </DndContext>
  );
}
