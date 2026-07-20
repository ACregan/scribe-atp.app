import type { Request, Response } from "express";
import path from "node:path";
import { enqueue } from "./queue.js";
import { emitEvent } from "./sse.js";
import { canAccessFolder, getFolder } from "./access.js";

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
  const uploadId = (req.body as Record<string, string>).uploadId ?? uuid;
  const outputDir = path.join(storageRoot, did, uuid);

  // targetFolderId (the folder the client was browsing when they clicked
  // Upload) is honored only if the caller can actually access it — otherwise
  // falls back to the caller's own root folder rather than reject the whole
  // upload. Read and write share one access gate (ADR 0028), so this now
  // only bites on a stale/invalid folderId or access revoked between the
  // client's last browse and this request (e.g. a Contributor removed from
  // a site mid-upload).
  const folderIdRaw = (req.body as Record<string, string>).folderId;
  let targetFolderId: number | undefined;
  if (folderIdRaw) {
    const parsed = parseInt(folderIdRaw, 10);
    const folder = !isNaN(parsed) ? getFolder(parsed) : undefined;
    if (folder && canAccessFolder(did, folder)) targetFolderId = folder.id;
  }

  enqueue({
    uploadId,
    did,
    uuid,
    fileBuffer: req.file.buffer,
    originalName: req.file.originalname,
    outputDir,
    targetFolderId,
  });
  emitEvent(uploadId, "queued", { uuid });

  res.status(202).json({ ok: true, uuid, uploadId });
}
