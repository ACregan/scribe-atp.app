import { useState } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { createFolder, bulkMove } from "~/services/imageServiceClient";
import styles from "./FolderModals.module.css";

type Props = {
  isOpen: boolean;
  imageIds: number[];
  folderIds: number[];
  currentFolderId: number;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddToNewFolderModal({
  isOpen,
  imageIds,
  folderIds,
  currentFolderId,
  onClose,
  onSuccess,
}: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Folder name is required");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const { id: newFolderId } = await createFolder(
        name.trim(),
        currentFolderId,
      );
      await bulkMove(imageIds, folderIds, newFolderId);
      setName("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setName("");
    setError(undefined);
    onClose();
  }

  const totalCount = imageIds.length + folderIds.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add to New Folder"
      footer={
        <div className={styles.footer}>
          <Button
            variant="secondary"
            type="button"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" form="add-to-new-folder-form" disabled={saving}>
            {saving
              ? "Creating…"
              : `Create & Move ${totalCount} ${totalCount === 1 ? "item" : "items"}`}
          </Button>
        </div>
      }
    >
      <form id="add-to-new-folder-form" onSubmit={handleSubmit}>
        <Input
          label="Folder name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
        />
      </form>
    </Modal>
  );
}
