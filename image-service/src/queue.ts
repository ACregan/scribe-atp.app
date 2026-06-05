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

async function processJob(job: QueueJob): Promise<void> {
  const { uploadId, did, uuid, fileBuffer, originalName, outputDir } = job;

  try {
    const { sizes, sourceWidth, sourceHeight } = await generateVariants(
      fileBuffer,
      outputDir,
      (name, dims) => emitEvent(uploadId, "variant", { name, ...dims })
    );

    db.prepare(
      `INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(did, uuid, originalName, sourceWidth, sourceHeight, JSON.stringify(sizes));

    emitEvent(uploadId, "complete", { uuid, sizes });
    closeSSE(uploadId);
  } catch (err) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    console.error("[queue] processing failed for uploadId", uploadId, err);
    emitEvent(uploadId, "error", { message: "Processing failed" });
    closeSSE(uploadId);
  }
}
