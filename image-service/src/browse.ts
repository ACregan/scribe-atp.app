import type { Request, Response } from "express";
import db from "./db.js";
import { canAccessFolder, type FolderRow } from "./access.js";

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

function buildBreadcrumbs(
  folderId: number,
  did: string,
): Array<{ id: number; name: string }> {
  const crumbs: Array<{ id: number; name: string }> = [];
  let currentId: number | null = folderId;
  while (currentId !== null) {
    const row = db
      .prepare(
        "SELECT id, user_did, site_uri, name, parent_id FROM image_folders WHERE id = ?",
      )
      .get(currentId) as FolderRow | undefined;
    if (!row) break;
    // Personal root folder names are DIDs — show "My Images" for the current
    // user's own root. Site root folders already have a real display name
    // ("{domain} Images", set at creation) so no override is needed there.
    const displayName =
      row.parent_id === null && row.user_did === did ? "My Images" : row.name;
    crumbs.unshift({ id: row.id, name: displayName });
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
    folder =
      (db
        .prepare(
          "SELECT id, user_did, site_uri, name, parent_id, created_at FROM image_folders WHERE id = ?",
        )
        .get(id) as FolderRow | undefined) ?? null;
    // 404, not 403 — a folder the caller has no access to should not even
    // confirm it exists (ADR 0020 point 1: "no other users should be able to
    // see or access this folder"). Applies uniformly to personal and site
    // folders alike — a user only sees their own personal root, plus the
    // root of any site they own or are an accepted Contributor on.
    if (!folder || !canAccessFolder(did, folder)) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
  } else {
    // No folderId: top-level shared view — every root folder (personal or
    // site) is filtered through the same owner-or-accepted-contributor check
    // used everywhere else.
    const allRootFolders = db
      .prepare(
        "SELECT id, user_did, site_uri, name, parent_id, created_at FROM image_folders WHERE parent_id IS NULL ORDER BY name",
      )
      .all() as FolderRow[];
    const visibleRootFolders = allRootFolders.filter((f) => canAccessFolder(did, f));
    res.json({
      folder: null,
      breadcrumbs: [],
      subfolders: visibleRootFolders,
      images: [],
    });
    return;
  }

  const breadcrumbs = buildBreadcrumbs(folder.id, did);

  const subfolders = db
    .prepare(
      "SELECT id, user_did, site_uri, name, parent_id, created_at FROM image_folders WHERE parent_id = ? ORDER BY name",
    )
    .all(folder.id) as FolderRow[];

  const imageRows = db
    .prepare(
      "SELECT id, user_did, filename, original_name, width, height, sizes, created_at FROM images WHERE folder_id = ? ORDER BY created_at DESC",
    )
    .all(folder.id) as ImageRow[];

  const images = imageRows.map((row) => ({
    ...row,
    sizes: JSON.parse(row.sizes) as Record<
      string,
      { width: number; height: number; bytes?: number }
    >,
  }));

  // canWrite (not just canReadFolder above) — the client uses this to decide
  // whether to show New Folder/Move/Delete/upload-into-here UI. A raw
  // `folder.user_did === currentUserDid` check (what this used to be, client
  // side) is wrong for site folders, whose user_did is always null — it
  // would hide write actions from the Owner and every accepted Contributor
  // alike while browsing their own shared folder.
  res.json({
    folder: { ...folder, canWrite: canAccessFolder(did, folder) },
    breadcrumbs,
    subfolders,
    images,
  });
}
