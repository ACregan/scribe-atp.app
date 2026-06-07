import { useState, useEffect } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import {
  getBulkDeleteCounts,
  bulkDelete,
  type BulkCounts,
} from "~/services/imageServiceClient";
import styles from "./FolderModals.module.css";

type Props = {
  isOpen: boolean;
  imageIds: number[];
  folderIds: number[];
  onClose: () => void;
  onSuccess: () => void;
};

export function BulkDeleteModal({
  isOpen,
  imageIds,
  folderIds,
  onClose,
  onSuccess,
}: Props) {
  const [counts, setCounts] = useState<BulkCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Fetch recursive counts whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setCounts(null);
    getBulkDeleteCounts(imageIds, folderIds)
      .then((data) => {
        if (!cancelled) setCounts(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to fetch item counts",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    setDeleting(true);
    setError(undefined);
    try {
      await bulkDelete(imageIds, folderIds);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  function handleClose() {
    setError(undefined);
    onClose();
  }

  function describeCount(
    count: number,
    singular: string,
    plural: string,
  ): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete items?"
      footer={
        <div className={styles.footer}>
          <Button
            variant="secondary"
            type="button"
            onClick={handleClose}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={handleConfirm}
            disabled={deleting || loading || !!error}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      }
    >
      {error && <p className={styles.error}>{error}</p>}
      {loading && (
        <p style={{ fontSize: "1.4rem", lineHeight: 1.6, margin: 0 }}>
          Calculating items to delete&hellip;
        </p>
      )}
      {!loading && !error && counts !== null && (
        <p style={{ fontSize: "1.4rem", lineHeight: 1.6, margin: 0 }}>
          This will permanently delete{" "}
          <strong>
            {describeCount(counts.folderCount, "folder", "folders")}
          </strong>{" "}
          and{" "}
          <strong>{describeCount(counts.imageCount, "image", "images")}</strong>
          . This cannot be undone.
        </p>
      )}
    </Modal>
  );
}
