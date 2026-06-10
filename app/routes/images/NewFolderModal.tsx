import { useState } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { createFolder } from "~/services/imageServiceClient";
import styles from "./FolderModals.module.css";

type Props = {
  isOpen: boolean;
  parentFolderId: number;
  onClose: () => void;
  onSuccess: () => void;
};

export function NewFolderModal({
  isOpen,
  parentFolderId,
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
      await createFolder(name.trim(), parentFolderId);
      setName("");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setName("");
    setError(undefined);
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Folder"
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-folder-form" disabled={saving}>
            {saving ? "Creating…" : "Create Folder"}
          </Button>
        </div>
      }
    >
      <form id="new-folder-form" onSubmit={handleSubmit}>
        <Input
          id="folder-name"
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
