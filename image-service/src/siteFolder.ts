import type { Request, Response } from "express";
import db from "./db.js";

// PUT /api/image-service/site-folder (ADR 0024, formerly /site-roster) —
// called by the CMS from site creation and the "Resync Image Folder" button
// on /site/:siteName/configure. Contributor *access* to the folder is no
// longer decided here — access.ts reads contributor_memberships live instead
// (ADR 0024) — so this endpoint's only remaining job is idempotent folder
// creation; there is no roster left to push.

function parseSiteOwnerDid(siteUri: string): string | null {
  const match = siteUri.match(/^at:\/\/([^/]+)\//);
  return match ? match[1] : null;
}

export function ensureSiteFolder(siteUri: string, siteName: string): void {
  const existing = db
    .prepare("SELECT id FROM image_folders WHERE site_uri = ? AND parent_id IS NULL")
    .get(siteUri);
  if (existing) return;

  db.prepare(
    "INSERT INTO image_folders (site_uri, name, parent_id, created_at) VALUES (?, ?, NULL, datetime('now'))",
  ).run(siteUri, `${siteName} Images`);
}

export function handleEnsureSiteFolder(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const { siteUri, siteName } = req.body as {
    siteUri?: unknown;
    siteName?: unknown;
  };

  if (typeof siteUri !== "string" || !siteUri.startsWith("at://")) {
    res.status(400).json({ error: "siteUri must be an at:// URI" });
    return;
  }
  if (typeof siteName !== "string" || !siteName.trim()) {
    res.status(400).json({ error: "siteName is required" });
    return;
  }

  const ownerDid = parseSiteOwnerDid(siteUri);
  if (!ownerDid || ownerDid !== did) {
    res.status(403).json({ error: "Only the site owner can create its folder" });
    return;
  }

  ensureSiteFolder(siteUri, siteName);

  res.json({ ok: true });
}
