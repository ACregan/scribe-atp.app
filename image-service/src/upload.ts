import type { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { generateVariants } from "./variants.js";
import db from "./db.js";

const ACCEPTED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/gif",
]);

export async function handleUpload(req: Request, res: Response): Promise<void> {
  const did = (req as Request & { userDid: string }).userDid;

  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  if (!ACCEPTED_MIMETYPES.has(req.file.mimetype)) {
    res.status(415).json({ error: "Unsupported file format. Accepted: JPEG, PNG, WebP, TIFF, GIF" });
    return;
  }

  const storageRoot = process.env.IMAGE_STORAGE_ROOT;
  if (!storageRoot) {
    res.status(500).json({ error: "IMAGE_STORAGE_ROOT is not configured" });
    return;
  }

  const uuid = crypto.randomUUID();
  const outputDir = path.join(storageRoot, did, uuid);

  try {
    const { sizes, sourceWidth, sourceHeight } = await generateVariants(
      req.file.buffer,
      outputDir
    );

    db.prepare(
      `INSERT INTO images (user_did, folder_id, filename, original_name, width, height, sizes, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(did, uuid, req.file.originalname, sourceWidth, sourceHeight, JSON.stringify(sizes));

    res.json({
      ok: true,
      uuid,
      uploadId: (req.body as Record<string, string>).uploadId ?? null,
      sizes,
    });
  } catch (err) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    console.error("[upload] processing error:", err);
    res.status(500).json({ error: "Upload processing failed" });
  }
}
