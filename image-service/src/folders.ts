import type { Request, Response } from "express";
import db from "./db.js";

type FolderRow = { id: number; user_did: string; name: string; parent_id: number | null };
type ImageRow = { id: number; user_did: string };

function requireOwnFolder(did: string, folderId: number): FolderRow | null {
  const folder = db
    .prepare("SELECT id, user_did, name, parent_id FROM image_folders WHERE id = ?")
    .get(folderId) as FolderRow | undefined;
  if (!folder || folder.user_did !== did) return null;
  return folder;
}

// GET /api/image-service/folders/mine — flat list of all folders the user owns
export function handleListFolders(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const folders = db
    .prepare("SELECT id, name, parent_id FROM image_folders WHERE user_did = ? ORDER BY parent_id NULLS FIRST, name")
    .all(did) as Array<{ id: number; name: string; parent_id: number | null }>;
  res.json({ folders });
}

// POST /api/image-service/folders — create a named subfolder
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

  const parent = requireOwnFolder(did, parentId);
  if (!parent) {
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
    .prepare("INSERT INTO image_folders (user_did, name, parent_id, created_at) VALUES (?, ?, ?, datetime('now'))")
    .run(did, trimmedName, parentId);

  const folder = db
    .prepare("SELECT id, user_did, name, parent_id, created_at FROM image_folders WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json({ ok: true, folder });
}

// DELETE /api/image-service/folders/:folderId — delete an empty folder
export function handleDeleteFolder(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const folderIdRaw = Array.isArray(req.params.folderId) ? req.params.folderId[0] : (req.params.folderId ?? "");
  const folderId = parseInt(folderIdRaw, 10);
  if (isNaN(folderId)) { res.status(400).json({ error: "Invalid folderId" }); return; }

  const folder = requireOwnFolder(did, folderId);
  if (!folder) { res.status(403).json({ error: "Forbidden" }); return; }

  if (folder.parent_id === null) {
    res.status(400).json({ error: "Cannot delete the root User Image Folder" });
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
    .prepare("SELECT id, user_did FROM images WHERE id = ?")
    .get(imageId) as ImageRow | undefined;
  if (!image || image.user_did !== did) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const targetFolder = requireOwnFolder(did, folderId);
  if (!targetFolder) {
    res.status(403).json({ error: "Target folder not found or not owned by you" });
    return;
  }

  db.prepare("UPDATE images SET folder_id = ? WHERE id = ?").run(folderId, imageId);
  res.json({ ok: true });
}
