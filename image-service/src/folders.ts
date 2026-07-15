import type { Request, Response } from "express";
import db from "./db.js";
import { canAccessFolder, canAccessImage, getFolder } from "./access.js";

type ImageRow = { id: number; user_did: string; folder_id: number | null };

// GET /api/image-service/folders/mine — flat list of all folders the user
// personally owns. Deliberately unchanged for Phase 2 — this only ever
// lists user_did-owned folders, so site folders never appear here regardless
// of roster membership; there is no "folders shared with me" list yet.
export function handleListFolders(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const folders = db
    .prepare("SELECT id, name, parent_id FROM image_folders WHERE user_did = ? ORDER BY parent_id NULLS FIRST, name")
    .all(did) as Array<{ id: number; name: string; parent_id: number | null }>;
  res.json({ folders });
}

// POST /api/image-service/folders — create a named subfolder. A subfolder
// inherits its parent's ownership (user_did or site_uri) rather than being
// attributed to whoever clicked "create" — a Contributor creating a
// subfolder inside a site folder must not end up owning it personally,
// or nobody else on the roster (including the Owner) could manage it.
export function handleCreateFolder(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const { name, parentId } = req.body as { name?: string; parentId?: number };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Folder name is required" });
    return;
  }

  if (!parentId || typeof parentId !== "number") {
    res.status(400).json({ error: "parentId is required" });
    return;
  }

  const parent = getFolder(parentId);
  if (!parent || !canAccessFolder(did, parent)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const trimmedName = name.trim();
  const existing = db
    .prepare("SELECT id FROM image_folders WHERE parent_id = ? AND name = ?")
    .get(parentId, trimmedName);
  if (existing) {
    res.status(409).json({ error: `A folder named "${trimmedName}" already exists here` });
    return;
  }

  const result = db
    .prepare(
      "INSERT INTO image_folders (user_did, site_uri, name, parent_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
    )
    .run(parent.user_did, parent.site_uri, trimmedName, parentId);

  const folder = db
    .prepare("SELECT id, user_did, site_uri, name, parent_id, created_at FROM image_folders WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json({ ok: true, folder });
}

// DELETE /api/image-service/folders/:folderId — delete an empty folder
export function handleDeleteFolder(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const folderIdRaw = Array.isArray(req.params.folderId) ? req.params.folderId[0] : (req.params.folderId ?? "");
  const folderId = parseInt(folderIdRaw, 10);
  if (isNaN(folderId)) { res.status(400).json({ error: "Invalid folderId" }); return; }

  const folder = getFolder(folderId);
  if (!folder || !canAccessFolder(did, folder)) { res.status(403).json({ error: "Forbidden" }); return; }

  if (folder.parent_id === null) {
    res.status(400).json({ error: "Cannot delete the root folder" });
    return;
  }

  const imageCount = (db.prepare("SELECT COUNT(*) as n FROM images WHERE folder_id = ?").get(folderId) as { n: number }).n;
  if (imageCount > 0) {
    res.status(409).json({ error: "Folder contains images and cannot be deleted" });
    return;
  }

  const subfolderCount = (db.prepare("SELECT COUNT(*) as n FROM image_folders WHERE parent_id = ?").get(folderId) as { n: number }).n;
  if (subfolderCount > 0) {
    res.status(409).json({ error: "Folder contains subfolders and cannot be deleted" });
    return;
  }

  db.prepare("DELETE FROM image_folders WHERE id = ?").run(folderId);
  res.json({ ok: true });
}

// POST /api/image-service/images/:imageId/move — move an image to a different folder
export function handleMoveImage(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const imageIdRaw = Array.isArray(req.params.imageId) ? req.params.imageId[0] : (req.params.imageId ?? "");
  const imageId = parseInt(imageIdRaw, 10);
  if (isNaN(imageId)) { res.status(400).json({ error: "Invalid imageId" }); return; }

  const { folderId } = req.body as { folderId?: number };
  if (typeof folderId !== "number") {
    res.status(400).json({ error: "folderId is required" });
    return;
  }

  const image = db
    .prepare("SELECT id, user_did, folder_id FROM images WHERE id = ?")
    .get(imageId) as ImageRow | undefined;
  if (!image || !canAccessImage(did, image)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const targetFolder = getFolder(folderId);
  if (!targetFolder || !canAccessFolder(did, targetFolder)) {
    res.status(403).json({ error: "Target folder not found or not accessible to you" });
    return;
  }

  db.prepare("UPDATE images SET folder_id = ? WHERE id = ?").run(folderId, imageId);
  res.json({ ok: true });
}
