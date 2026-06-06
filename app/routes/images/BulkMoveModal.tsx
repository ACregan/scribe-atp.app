import { useState, useEffect } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import styles from "./FolderModals.module.css";

type FolderOption = { id: number; name: string; parent_id: number | null };

type Props = {
  isOpen: boolean;
  imageIds: number[];
  folderIds: number[];
  currentFolderId: number | null;
  onClose: () => void;
  onSuccess: () => void;
};

function buildLabel(folder: FolderOption, all: FolderOption[]): string {
  const parts: string[] = [folder.name];
  let parentId = folder.parent_id;
  while (parentId !== null) {
    const parent = all.find((f) => f.id === parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parent_id;
  }
  return parts.join(" › ");
}

function collectDescendants(
  seedIds: number[],
  all: FolderOption[],
): Set<number> {
  const result = new Set<number>();
  const queue = [...seedIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const f of all) {
      if (f.parent_id === current && !result.has(f.id)) {
        result.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}

export function BulkMoveModal({
  isOpen,
  imageIds,
  folderIds,
  currentFolderId,
  onClose,
  onSuccess,
}: Props) {
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(null);
    setError(undefined);
    fetch("/api/image-service/folders/mine")
      .then((r) => r.json() as Promise<{ folders: FolderOption[] }>)
      .then((data) => setFolders(data.folders))
      .catch(() => setError("Could not load folders"));
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedId === null) {
      setError("Select a destination folder");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const res = await fetch("/api/image-service/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIds,
          folderIds,
          destinationFolderId: selectedId,
        }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Move failed");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setSelectedId(null);
    setError(undefined);
    onClose();
  }

  const descendants = collectDescendants(folderIds, folders);
  const excludedIds = new Set([
    ...(currentFolderId !== null ? [currentFolderId] : []),
    ...folderIds,
    ...descendants,
  ]);
  const options = folders.filter((f) => !excludedIds.has(f.id));
  const totalCount = imageIds.length + folderIds.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Move ${totalCount} ${totalCount === 1 ? "item" : "items"}`}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="bulk-move-form"
            disabled={saving || selectedId === null}
          >
            {saving ? "Moving…" : "Move Here"}
          </Button>
        </div>
      }
    >
      <form id="bulk-move-form" onSubmit={handleSubmit}>
        {error && <p className={styles.error}>{error}</p>}
        {options.length === 0 && !error && (
          <p className={styles.empty}>No valid destination folders.</p>
        )}
        <ul className={styles.folderList}>
          {options.map((f) => (
            <li key={f.id}>
              <label
                className={`${styles.folderOption}${selectedId === f.id ? ` ${styles.folderOptionSelected}` : ""}`}
              >
                <input
                  type="radio"
                  name="folderId"
                  value={f.id}
                  checked={selectedId === f.id}
                  onChange={() => setSelectedId(f.id)}
                  className={styles.hiddenRadio}
                />
                {buildLabel(f, folders)}
              </label>
            </li>
          ))}
        </ul>
      </form>
    </Modal>
  );
}
