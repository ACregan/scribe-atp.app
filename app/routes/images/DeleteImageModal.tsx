import { useState } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import styles from "./FolderModals.module.css";

type Props = {
  isOpen: boolean;
  imageId: number;
  imageName: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function DeleteImageModal({ isOpen, imageId, imageName, onClose, onSuccess }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleConfirm() {
    setDeleting(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/image-service/images/${imageId}`, { method: "DELETE" });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Delete failed");
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleClose() {
    setError(undefined);
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Delete "${imageName}"?`}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" type="button" onClick={handleClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" type="button" onClick={handleConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete Image"}
          </Button>
        </div>
      }
    >
      {error && <p className={styles.error}>{error}</p>}
      <p style={{ fontSize: "1.4rem", lineHeight: 1.6, margin: 0 }}>
        This will permanently delete <strong>{imageName}</strong> and all its size variants.
      </p>
      <p style={{ fontSize: "1.4rem", lineHeight: 1.6, marginTop: "1rem", marginBottom: 0 }}>
        Any Articles or Sites that reference this image URL will display broken images after deletion. This cannot be undone.
      </p>
    </Modal>
  );
}
