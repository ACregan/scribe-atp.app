import { useRef, useState, useCallback, useEffect } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import styles from "./UploadModal.module.css";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff", "image/gif"]);
const MAX_BYTES = 50 * 1024 * 1024;
const VARIANT_ORDER = ["thumb", "600", "1200", "1800", "max"] as const;

type FileStatus = "pending" | "uploading" | "processing" | "complete" | "error";

type FileEntry = {
  uploadId: string;
  file: File;
  previewUrl: string;
  validationError?: string;
  status: FileStatus;
  uploadProgress: number;
  completedVariants: string[];
  processingError?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function UploadModal({ isOpen, onClose }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [phase, setPhase] = useState<"selection" | "progress">("selection");
  const [isDragging, setIsDragging] = useState(false);

  const xhrRefs = useRef<Record<string, XMLHttpRequest>>({});
  const sseRefs = useRef<Record<string, EventSource>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!isOpen) {
      setFiles(prev => {
        prev.forEach(f => URL.revokeObjectURL(f.previewUrl));
        return [];
      });
      setPhase("selection");
      setIsDragging(false);
      Object.values(xhrRefs.current).forEach(x => x.abort());
      Object.values(sseRefs.current).forEach(s => s.close());
      xhrRefs.current = {};
      sseRefs.current = {};
    }
  }, [isOpen]);

  function validate(file: File): string | undefined {
    if (file.size > MAX_BYTES) return "File exceeds 50 MB limit";
    if (!ACCEPTED_TYPES.has(file.type)) return "Unsupported format (JPEG, PNG, WebP, TIFF, GIF only)";
  }

  function addFiles(incoming: FileList | File[]) {
    const newEntries: FileEntry[] = Array.from(incoming).map(file => ({
      uploadId: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      validationError: validate(file),
      status: "pending",
      uploadProgress: 0,
      completedVariants: [],
    }));
    setFiles(prev => [...prev, ...newEntries]);
  }

  function removeFile(uploadId: string) {
    setFiles(prev => {
      const entry = prev.find(f => f.uploadId === uploadId);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter(f => f.uploadId !== uploadId);
    });
  }

  const updateFile = useCallback((uploadId: string, patch: Partial<FileEntry>) => {
    setFiles(prev => prev.map(f => f.uploadId === uploadId ? { ...f, ...patch } : f));
  }, []);

  function startUpload() {
    const uploadable = files.filter(f => !f.validationError && f.status === "pending");
    if (uploadable.length === 0) return;

    setPhase("progress");

    for (const entry of uploadable) {
      openSSE(entry.uploadId);
      uploadFile(entry);
    }
  }

  function openSSE(uploadId: string) {
    const es = new EventSource(`/api/image-service/progress/${uploadId}`);

    es.addEventListener("variant", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { name: string };
      setFiles(prev => prev.map(f =>
        f.uploadId === uploadId
          ? { ...f, completedVariants: [...f.completedVariants, data.name] }
          : f
      ));
    });

    es.addEventListener("complete", () => {
      updateFile(uploadId, { status: "complete" });
      es.close();
      delete sseRefs.current[uploadId];
    });

    es.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data
        ? JSON.parse((e as MessageEvent).data) as { message?: string }
        : {};
      updateFile(uploadId, { status: "error", processingError: data.message ?? "Processing failed" });
      es.close();
      delete sseRefs.current[uploadId];
    });

    sseRefs.current[uploadId] = es;
  }

  function uploadFile(entry: FileEntry) {
    const { uploadId, file } = entry;
    const xhr = new XMLHttpRequest();
    xhrRefs.current[uploadId] = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        updateFile(uploadId, { uploadProgress: pct });
      }
    });

    xhr.addEventListener("load", () => {
      updateFile(uploadId, { uploadProgress: 100, status: "processing" });
      delete xhrRefs.current[uploadId];
    });

    xhr.addEventListener("error", () => {
      updateFile(uploadId, { status: "error", processingError: "Upload failed" });
      delete xhrRefs.current[uploadId];
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("uploadId", uploadId);

    updateFile(uploadId, { status: "uploading" });
    xhr.open("POST", "/api/image-service/upload");
    xhr.send(formData);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  const uploadableCount = files.filter(f => !f.validationError && f.status === "pending").length;
  const allDone = files.length > 0 && files.every(f => f.status === "complete" || f.status === "error" || f.validationError);

  const footer = phase === "selection" ? (
    <div className={styles.footer}>
      <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
      <Button
        type="button"
        onClick={startUpload}
        disabled={uploadableCount === 0}
      >
        Upload {uploadableCount} {uploadableCount === 1 ? "File" : "Files"}
      </Button>
    </div>
  ) : (
    <div className={styles.footer}>
      <Button type="button" onClick={onClose} disabled={!allDone}>
        {allDone ? "Done" : "Processing…"}
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Images" footer={footer}>
      {phase === "selection" && (
        <>
          <div
            className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ""}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className={styles.dropZoneText}>
              Drag &amp; drop images here, or <strong>click to browse</strong>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/tiff,image/gif"
              className={styles.hiddenInput}
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          {files.length > 0 && (
            <ul className={styles.fileList}>
              {files.map(entry => (
                <li key={entry.uploadId} className={styles.fileRow}>
                  <img src={entry.previewUrl} alt={entry.file.name} className={styles.filePreview} />
                  <div className={styles.fileInfo}>
                    <span className={styles.fileName}>{entry.file.name}</span>
                    {entry.validationError && (
                      <span className={styles.validationError}>{entry.validationError}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeFile(entry.uploadId)}
                    aria-label={`Remove ${entry.file.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {phase === "progress" && (
        <ul className={styles.fileList}>
          {files.filter(f => !f.validationError).map(entry => (
            <li key={entry.uploadId} className={styles.progressRow}>
              <img src={entry.previewUrl} alt={entry.file.name} className={styles.filePreview} />
              <div className={styles.progressInfo}>
                <span className={styles.fileName}>{entry.file.name}</span>

                <div className={styles.progressBarTrack}>
                  <div
                    className={`${styles.progressBarFill} ${entry.status === "error" ? styles.progressBarError : ""}`}
                    style={{ width: `${entry.uploadProgress}%` }}
                  />
                </div>

                <div className={styles.progressLabel}>
                  {entry.status === "uploading" && `Uploading… ${entry.uploadProgress}%`}
                  {entry.status === "processing" && "Processing variants…"}
                  {entry.status === "complete" && "Complete"}
                  {entry.status === "error" && (entry.processingError ?? "Error")}
                </div>

                {(entry.status === "processing" || entry.status === "complete") && (
                  <div className={styles.variantTicks}>
                    {VARIANT_ORDER.map(v => (
                      <span
                        key={v}
                        className={`${styles.variantChip} ${entry.completedVariants.includes(v) ? styles.variantChipDone : ""}`}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
