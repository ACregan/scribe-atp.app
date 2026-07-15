import db from "./db.js";

// Centralizes the access check every read/write endpoint needs (ADR 0020
// point 8) — previously duplicated per-file as `!row || row.user_did !== did`
// across folders.ts, deleteImage.ts, and bulkOperations.ts, and entirely
// absent from browse.ts. A folder (and, by extension, every image inside it)
// is owned by exactly one of a user or a site (enforced by db.ts's CHECK
// constraint): personal folders keep today's owner-only access; site folders
// are accessible to the site's Owner (parsed directly from `site_uri`, no
// lookup needed) or anyone in `site_rosters` for that `site_uri` — and
// nobody else, not even other authenticated users (ADR 0020 point 1).

export type FolderRow = {
  id: number;
  user_did: string | null;
  site_uri: string | null;
  name: string;
  parent_id: number | null;
};

function parseSiteOwnerDid(siteUri: string): string | null {
  const match = siteUri.match(/^at:\/\/([^/]+)\//);
  return match ? match[1] : null;
}

function isSiteRosterMember(siteUri: string, did: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM site_rosters WHERE site_uri = ? AND member_did = ?")
    .get(siteUri, did);
  return row !== undefined;
}

export function canAccessFolder(did: string, folder: FolderRow): boolean {
  if (folder.user_did !== null) return folder.user_did === did;
  if (folder.site_uri !== null) {
    const ownerDid = parseSiteOwnerDid(folder.site_uri);
    return did === ownerDid || isSiteRosterMember(folder.site_uri, did);
  }
  return false;
}

export function getFolder(folderId: number): FolderRow | undefined {
  return db
    .prepare("SELECT id, user_did, site_uri, name, parent_id FROM image_folders WHERE id = ?")
    .get(folderId) as FolderRow | undefined;
}

// Images resolve access through their *current* folder, not their own
// user_did (which only ever records who originally uploaded them — still
// used for the on-disk storage path, never for authorization). This matters
// specifically for site folders: full write parity (ADR 0020 point 2) means
// any roster member can move/delete an image a *different* Contributor
// uploaded, which a check against the image's own user_did would wrongly
// forbid.
export function canAccessImage(did: string, image: { folder_id: number | null }): boolean {
  if (image.folder_id === null) return false;
  const folder = getFolder(image.folder_id);
  if (!folder) return false;
  return canAccessFolder(did, folder);
}
