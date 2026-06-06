import { useState, useEffect, useCallback } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { MoveImageModal } from "./MoveImageModal";
import { useToast } from "~/components/Toast/ToastContext";
import styles from "./ImagePreviewModal.module.css";

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

type Props = {
  isOpen: boolean;
  image: BrowseImage;
  images: BrowseImage[];
  folder: {
    id: number;
    user_did: string;
    name: string;
    parent_id: number | null;
  } | null;
  breadcrumbs: Array<{ id: number; name: string }>;
  currentUserDid: string;
  onClose: () => void;
  onDelete: (imageId: number) => void;
  onMove: () => void;
};

const VARIANT_ORDER = ["thumb", "600", "1200", "1800", "max"];
const VARIANT_LABEL: Record<string, string> = {
  thumb: "Thumb",
  "600": "600w",
  "1200": "1200w",
  "1800": "1800w",
  max: "Max",
};

function largestVariant(sizes: BrowseImage["sizes"]): string {
  for (let i = VARIANT_ORDER.length - 1; i >= 0; i--) {
    if (VARIANT_ORDER[i] in sizes) return VARIANT_ORDER[i];
  }
  return "max";
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ImagePreviewModal({
  isOpen,
  image: initialImage,
  images,
  folder,
  breadcrumbs,
  currentUserDid,
  onClose,
  onDelete,
  onMove,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    images.findIndex((img) => img.id === initialImage.id),
  );
  const [selectedVariant, setSelectedVariant] = useState(() =>
    largestVariant(initialImage.sizes),
  );
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);

  const image = images[currentIndex] ?? initialImage;
  const isOwn = image.user_did === currentUserDid;

  // When the parent opens the modal for a new image, reset to that image's index
  useEffect(() => {
    const idx = images.findIndex((img) => img.id === initialImage.id);
    setCurrentIndex(idx >= 0 ? idx : 0);
    setSelectedVariant(largestVariant(initialImage.sizes));
    setShowDeleteConfirm(false);
    setDeleteError(null);
  }, [initialImage.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When navigating to a new image, reset variant and delete state
  useEffect(() => {
    setSelectedVariant(largestVariant(image.sizes));
    setShowDeleteConfirm(false);
    setDeleteError(null);
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedVariants = VARIANT_ORDER.filter((v) => v in image.sizes);

  function goPrev() {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
    setCopied(false);
  }

  function goNext() {
    setCurrentIndex((i) => (i + 1) % images.length);
    setCopied(false);
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    },
    [isOpen, currentIndex, images.length], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function handleDeleteConfirm() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/image-service/images/${image.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete(image.id);
      } else {
        const data = (await res.json()) as { error?: string };
        setDeleteError(data.error ?? "Delete failed");
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleClose() {
    setShowDeleteConfirm(false);
    setDeleteError(null);
    setMoveModalOpen(false);
    onClose();
  }

  function handleVariantSelect(variant: string) {
    setSelectedVariant(variant);
    setCopied(false);
  }

  function handleCopy() {
    const url = `${window.location.origin}/image-storage/${image.user_did}/${image.filename}/${selectedVariant}.webp`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied((prev) => (prev ? false : prev)), 2000);
        addToast({
          heading: "URL copied to clipboard",
          content: `${image.original_name} — ${VARIANT_LABEL[selectedVariant] ?? selectedVariant}`,
          variant: "primary",
          expireTimeSeconds: 10,
        });
      })
      .catch(() => {
        /* clipboard denied */
      });
  }

  const variantData = image.sizes[selectedVariant];
  const displayWidth = variantData?.width;
  const displayHeight = variantData?.height;
  const displayBytes = variantData?.bytes;
  const folderPath =
    breadcrumbs.length > 0
      ? breadcrumbs.map((b) => b.name).join(" › ")
      : "Image Library";

  const deleteConfirmFooter = (
    <div className={styles.deleteConfirm}>
      {deleteError && <p className={styles.deleteError}>{deleteError}</p>}
      <p className={styles.deleteConfirmText}>
        Delete this image? This cannot be undone.
      </p>
      <div className={styles.deleteConfirmActions}>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          type="button"
          onClick={handleDeleteConfirm}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Confirm Delete"}
        </Button>
      </div>
    </div>
  );

  const normalFooter = (
    <div className={styles.footer}>
      {isOwn && (
        <div className={styles.footerOwnerActions}>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setMoveModalOpen(true)}
          >
            Move
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </Button>
        </div>
      )}
      {images.length > 1 && (
        <div className={styles.footerNav}>
          <Button variant="secondary" type="button" onClick={goPrev}>
            ‹ Prev
          </Button>
          <span className={styles.navCounter}>
            {currentIndex + 1} / {images.length}
          </span>
          <Button variant="secondary" type="button" onClick={goNext}>
            Next ›
          </Button>
        </div>
      )}
      <Button variant="secondary" type="button" onClick={handleClose}>
        Close
      </Button>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={image.original_name}
        footer={showDeleteConfirm ? deleteConfirmFooter : normalFooter}
        style={{
          width: "calc(100dvw - 4rem)",
          maxWidth: "calc(100dvw - 4rem)",
          height: "calc(100dvh - 4rem)",
          maxHeight: "calc(100dvh - 4rem)",
        }}
        bodyStyle={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className={styles.body}>
          <div className={styles.imageWrap}>
            <img
              key={`${image.id}-${selectedVariant}`}
              src={`/image-storage/${image.user_did}/${image.filename}/${selectedVariant}.webp`}
              alt={image.original_name}
              className={styles.previewImage}
              style={{
                maxWidth:
                  displayWidth !== undefined
                    ? `min(100%, ${displayWidth}px)`
                    : undefined,
              }}
            />
          </div>

          <div className={styles.variantRow}>
            <div className={styles.variantButtons}>
              {orderedVariants.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.variantButton}${selectedVariant === v ? ` ${styles.variantButtonActive}` : ""}`}
                  onClick={() => handleVariantSelect(v)}
                >
                  {VARIANT_LABEL[v] ?? v}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`${styles.copyButton}${copied ? ` ${styles.copyButtonCopied}` : ""}`}
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy URL"}
            </button>
          </div>

          <dl className={styles.meta}>
            <div className={styles.metaRow}>
              <dt>Dimensions</dt>
              <dd>
                {displayWidth !== undefined && displayHeight !== undefined
                  ? `${displayWidth} × ${displayHeight} px`
                  : "—"}
              </dd>
            </div>
            <div className={styles.metaRow}>
              <dt>File size</dt>
              <dd>{formatBytes(displayBytes)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Uploaded</dt>
              <dd>{new Date(image.created_at).toLocaleDateString()}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Filename</dt>
              <dd>{image.original_name}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Folder</dt>
              <dd>{folderPath}</dd>
            </div>
          </dl>
        </div>
      </Modal>

      {moveModalOpen && (
        <MoveImageModal
          isOpen={true}
          imageId={image.id}
          imageName={image.original_name}
          currentFolderId={folder?.id ?? null}
          onClose={() => setMoveModalOpen(false)}
          onSuccess={() => {
            setMoveModalOpen(false);
            onMove();
          }}
        />
      )}
    </>
  );
}
