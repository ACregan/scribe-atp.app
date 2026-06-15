import type { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import db from "./db.js";
import { logger } from "../../shared/logger.js";

type ImageRow = { id: number; user_did: string; filename: string };

export function handleDeleteImage(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const imageIdRaw = Array.isArray(req.params.imageId) ? req.params.imageId[0] : (req.params.imageId ?? "");
  const imageId = parseInt(imageIdRaw, 10);
  if (isNaN(imageId)) { res.status(400).json({ error: "Invalid imageId" }); return; }

  const image = db
    .prepare("SELECT id, user_did, filename FROM images WHERE id = ?")
    .get(imageId) as ImageRow | undefined;
  if (!image || image.user_did !== did) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const storageRoot = process.env.IMAGE_STORAGE_ROOT;

  // Delete the SQLite row first — if filesystem cleanup fails afterwards, no dangling
  // reference remains pointing to missing files.
  db.prepare("DELETE FROM images WHERE id = ?").run(imageId);
  logger.info({ event: "image.delete", user_did: did, image_id: imageId, filename: image.filename }, "image.delete");

  if (storageRoot) {
    const dirPath = path.join(storageRoot, image.user_did, image.filename);
    fs.rm(dirPath, { recursive: true, force: true }).catch((err) => {
      console.error("[deleteImage] filesystem cleanup failed for", dirPath, err);
    });
  }

  res.json({ ok: true });
}
