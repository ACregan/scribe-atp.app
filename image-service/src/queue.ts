import fs from "node:fs/promises";
import { generateVariants } from "./variants.js";
import { emitEvent, closeSSE } from "./sse.js";
import db from "./db.js";

type QueueJob = {
  uploadId: string;
  did: string;
  uuid: string;
  fileBuffer: Buffer;
  originalName: string;
  outputDir: string;
};

// Sequential promise chain — one file processes at a time
let tail: Promise<void> = Promise.resolve();

export function enqueue(job: QueueJob): void {
  tail = tail
    .then(() => processJob(job))
    .catch((err) => {
      console.error("[queue] unhandled error for uploadId", job.uploadId, err);
    });
}

// Returns the id of the user's root folder, creating it if it doesn't exist yet.
function ensureUserFolder(did: string): number {
  const existing = db
    .prepare("SELECT id FROM image_folders WHERE user_did = ? AND parent_id IS NULL")
    .get(did) as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db
    .prepare("INSERT INTO image_folders (user_did, name, parent_id, created_at) VALUES (?, ?, NULL, datetime('now'))")
    .run(did, did);
  return result.lastInsertRowid as number;
}

async function processJob(job: QueueJob): Promise<void> {
  const { uploadId, did, uuid, fileBuffer, originalName, outputDir } = job;

  try {
    const { sizes, sourceWidth, sourceHeight } = await generateVariants(
      fileBuffer,
      outputDir,
      (name, dims) => emitEvent(uploadId, "variant", { name, ...dims })
    );

    const folderId = ensureUserFolder(did);

    db.prepare(
      `INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(did, folderId, uuid, originalName, sourceWidth, sourceHeight, JSON.stringify(sizes));

    emitEvent(uploadId, "complete", { uuid, sizes });
    closeSSE(uploadId);
  } catch (err) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    console.error("[queue] processing failed for uploadId", uploadId, err);
    emitEvent(uploadId, "error", { message: "Processing failed" });
    closeSSE(uploadId);
  }
}
