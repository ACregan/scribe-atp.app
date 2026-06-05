import type { Request, Response } from "express";
import db from "./db.js";

type FolderRow = { id: number; name: string; parent_id: number | null; created_at: string };
type ImageRow = {
  id: number;
  user_did: string;
  filename: string;
  original_name: string;
  width: number;
  height: number;
  sizes: string;
  created_at: string;
};

function buildBreadcrumbs(folderId: number): Array<{ id: number; name: string }> {
  const crumbs: Array<{ id: number; name: string }> = [];
  let currentId: number | null = folderId;
  while (currentId !== null) {
    const row = db
      .prepare("SELECT id, name, parent_id FROM image_folders WHERE id = ?")
      .get(currentId) as FolderRow | undefined;
    if (!row) break;
    crumbs.unshift({ id: row.id, name: row.name });
    currentId = row.parent_id;
  }
  return crumbs;
}

export function handleBrowse(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const folderIdParam = (req.query as Record<string, string>).folderId;

  let folder: FolderRow | null = null;

  if (folderIdParam) {
    const id = parseInt(folderIdParam, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid folderId" });
      return;
    }
    folder = db
      .prepare("SELECT id, name, parent_id, created_at FROM image_folders WHERE id = ?")
      .get(id) as FolderRow | undefined ?? null;
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
  } else {
    folder = db
      .prepare("SELECT id, name, parent_id, created_at FROM image_folders WHERE user_did = ? AND parent_id IS NULL LIMIT 1")
      .get(did) as FolderRow | undefined ?? null;
  }

  if (!folder) {
    res.json({ folder: null, breadcrumbs: [], subfolders: [], images: [] });
    return;
  }

  const breadcrumbs = buildBreadcrumbs(folder.id);

  const subfolders = db
    .prepare("SELECT id, name, parent_id, created_at FROM image_folders WHERE parent_id = ? ORDER BY name")
    .all(folder.id) as FolderRow[];

  const imageRows = db
    .prepare("SELECT id, user_did, filename, original_name, width, height, sizes, created_at FROM images WHERE folder_id = ? ORDER BY created_at DESC")
    .all(folder.id) as ImageRow[];

  const images = imageRows.map((row) => ({
    ...row,
    sizes: JSON.parse(row.sizes) as Record<string, { width: number; height: number }>,
  }));

  res.json({ folder, breadcrumbs, subfolders, images });
}
