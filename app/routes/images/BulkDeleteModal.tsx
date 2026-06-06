import { useState, useEffect } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import styles from "./FolderModals.module.css";

type Props = {
  isOpen: boolean;
  imageIds: number[];
  folderIds: number[];
  onClose: () => void;
  onSuccess: () => void;
};

type CountsResult = {
  folderCount: number;
  imageCount: number;
};

export function BulkDeleteModal({
  isOpen,
  imageIds,
  folderIds,
  onClose,
  onSuccess,
}: Props) {
  const [counts, setCounts] = useState<CountsResult | null>(null);
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
    fetch("/api/image-service/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds, folderIds }),
    })
      .then((res) => {
        if (!res.ok)
          return res
            .json()
            .then((d: { error?: string }) =>
              Promise.reject(d.error ?? "Request failed"),
            );
        return res.json() as Promise<{
          ok: false;
          folderCount: number;
          imageCount: number;
        }>;
      })
      .then((data) => {
        if (!cancelled)
          setCounts({
            folderCount: data.folderCount,
            imageCount: data.imageCount,
          });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            typeof err === "string" ? err : "Failed to fetch item counts",
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
      const res = await fetch("/api/image-service/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds, folderIds, confirm: true }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
      }
    } catch {
      setError("Delete failed");
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
