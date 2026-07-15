import type { Request, Response } from "express";
import db from "./db.js";
import { canAccessFolder, canAccessImage, getFolder } from "./access.js";

type ImageOwnerRow = { id: number; user_did: string; folder_id: number | null };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isArrayOfNumbers(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((v) => typeof v === "number" && Number.isInteger(v))
  );
}

/**
 * Returns null when access is confirmed for all ids (or ids is empty).
 * Returns the first offending id as a number when any row is missing or the
 * caller isn't the owner/a roster member (access.ts's canAccessImage).
 */
function checkImageAccess(did: string, ids: number[]): number | null {
  for (const id of ids) {
    const row = db
      .prepare("SELECT id, user_did, folder_id FROM images WHERE id = ?")
      .get(id) as ImageOwnerRow | undefined;
    if (!row || !canAccessImage(did, row)) return id;
  }
  return null;
}

function checkFolderAccess(did: string, ids: number[]): number | null {
  for (const id of ids) {
    const row = getFolder(id);
    if (!row || !canAccessFolder(did, row)) return id;
  }
  return null;
}

/**
 * Returns true if `ancestorCandidateIds` contains `folderId` or any folder
 * on the path from `folderId` up to the root.
 */
function isDescendantOfAny(
  folderId: number,
  ancestorCandidateIds: Set<number>,
): boolean {
  let current: number | null = folderId;
  while (current !== null) {
    if (ancestorCandidateIds.has(current)) return true;
    const row = db
      .prepare("SELECT parent_id FROM image_folders WHERE id = ?")
      .get(current) as { parent_id: number | null } | undefined;
    if (!row) break;
    current = row.parent_id;
  }
  return false;
}

/**
 * Recursively collects all descendant folder ids for `folderId` (not
 * including `folderId` itself).
 */
function collectDescendantFolderIds(folderId: number): number[] {
  const result: number[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = db
      .prepare("SELECT id FROM image_folders WHERE parent_id = ?")
      .all(current) as Array<{ id: number }>;
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

/**
 * Counts images directly in a set of folder ids.
 */
function countImagesInFolders(folderIds: number[]): number {
  if (folderIds.length === 0) return 0;
  const placeholders = folderIds.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT COUNT(*) as n FROM images WHERE folder_id IN (${placeholders})`,
    )
    .get(...folderIds) as { n: number };
  return row.n;
}

// ---------------------------------------------------------------------------
// POST /api/image-service/bulk-move
// ---------------------------------------------------------------------------

export function handleBulkMove(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const { imageIds, folderIds, destinationFolderId } = req.body as {
    imageIds?: unknown;
    folderIds?: unknown;
    destinationFolderId?: unknown;
  };

  // Validate
  if (!isArrayOfNumbers(imageIds)) {
    res.status(400).json({ error: "imageIds must be an array of numbers" });
    return;
  }
  if (!isArrayOfNumbers(folderIds)) {
    res.status(400).json({ error: "folderIds must be an array of numbers" });
    return;
  }
  if (
    typeof destinationFolderId !== "number" ||
    !Number.isInteger(destinationFolderId)
  ) {
    res.status(400).json({ error: "destinationFolderId must be a number" });
    return;
  }

  // Access checks
  const badImage = checkImageAccess(did, imageIds);
  if (badImage !== null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const badFolder = checkFolderAccess(did, folderIds);
  if (badFolder !== null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const destRow = getFolder(destinationFolderId);
  if (!destRow || !canAccessFolder(did, destRow)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Cycle detection: destination must not be any of the moved folders or a
  // descendant of any of them.
  if (folderIds.length > 0) {
    const movedSet = new Set(folderIds);
    if (isDescendantOfAny(destinationFolderId, movedSet)) {
      res.status(400).json({
        error: "Cannot move a folder into itself or its own subfolder",
      });
      return;
    }
  }

  // Atomic transaction
  const moveAll = db.transaction(() => {
    for (const id of imageIds) {
      db.prepare("UPDATE images SET folder_id = ? WHERE id = ?").run(
        destinationFolderId,
        id,
      );
    }
    for (const id of folderIds) {
      db.prepare("UPDATE image_folders SET parent_id = ? WHERE id = ?").run(
        destinationFolderId,
        id,
      );
    }
  });

  moveAll();
  res.json({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /api/image-service/bulk-delete
// ---------------------------------------------------------------------------

export function handleBulkDelete(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const { imageIds, folderIds, confirm } = req.body as {
    imageIds?: unknown;
    folderIds?: unknown;
    confirm?: unknown;
  };

  // Validate
  if (!isArrayOfNumbers(imageIds)) {
    res.status(400).json({ error: "imageIds must be an array of numbers" });
    return;
  }
  if (!isArrayOfNumbers(folderIds)) {
    res.status(400).json({ error: "folderIds must be an array of numbers" });
    return;
  }

  // Access checks
  const badImage = checkImageAccess(did, imageIds);
  if (badImage !== null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const badFolder = checkFolderAccess(did, folderIds);
  if (badFolder !== null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Guard: root folder (parent_id IS NULL) cannot be deleted
  for (const id of folderIds) {
    const row = db
      .prepare("SELECT parent_id FROM image_folders WHERE id = ?")
      .get(id) as { parent_id: number | null } | undefined;
    if (row && row.parent_id === null) {
      res.status(400).json({
        error: "Cannot delete the root User Image Folder",
      });
      return;
    }
  }

  // Recursively collect all folder ids to delete (specified + all descendants)
  const allFolderIds = new Set<number>(folderIds);
  for (const id of folderIds) {
    for (const desc of collectDescendantFolderIds(id)) {
      allFolderIds.add(desc);
    }
  }
  const allFolderIdList = Array.from(allFolderIds);

  // Count everything that would be deleted
  const folderCount = allFolderIdList.length;
  const imagesInFolders = countImagesInFolders(allFolderIdList);
  const directImageCount = imageIds.length;
  const imageCount = imagesInFolders + directImageCount;

  if (confirm !== true) {
    res.json({ ok: false, folderCount, imageCount });
    return;
  }

  // Atomic deletion
  const deleteAll = db.transaction(() => {
    // Delete images inside the folder tree
    if (allFolderIdList.length > 0) {
      const placeholders = allFolderIdList.map(() => "?").join(", ");
      db.prepare(`DELETE FROM images WHERE folder_id IN (${placeholders})`).run(
        ...allFolderIdList,
      );
    }

    // Delete directly specified images
    if (imageIds.length > 0) {
      const placeholders = imageIds.map(() => "?").join(", ");
      db.prepare(`DELETE FROM images WHERE id IN (${placeholders})`).run(
        ...imageIds,
      );
    }

    // Delete folders (leaves first via reverse BFS order so FK constraints are
    // satisfied — SQLite's FK enforcement is off by default but this is safer)
    if (allFolderIdList.length > 0) {
      // Delete in reverse order so children are removed before parents
      const orderedIds = [...allFolderIdList].reverse();
      for (const id of orderedIds) {
        db.prepare("DELETE FROM image_folders WHERE id = ?").run(id);
      }
    }
  });

  deleteAll();
  res.json({ ok: true, folderCount, imageCount });
}
