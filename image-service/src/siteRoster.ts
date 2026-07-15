import type { Request, Response } from "express";
import db from "./db.js";

// PUT /api/image-service/site-roster (ADR 0017/0020) — called by the CMS
// from three places: site creation (empty memberDids, just to get the
// folder to exist), removeContributor (revoke immediately), and the
// accepted-promotion branch of reconcileContributorStatuses (grant access).
// Wholesale replace, never a diff — mirrors scribe.contributors being the
// full source of truth on the CMS side, so there's nothing to reconcile
// here beyond "make site_rosters match exactly what was just sent."

function parseSiteOwnerDid(siteUri: string): string | null {
  const match = siteUri.match(/^at:\/\/([^/]+)\//);
  return match ? match[1] : null;
}

function ensureSiteFolder(siteUri: string, siteName: string): void {
  const existing = db
    .prepare("SELECT id FROM image_folders WHERE site_uri = ? AND parent_id IS NULL")
    .get(siteUri);
  if (existing) return;

  db.prepare(
    "INSERT INTO image_folders (site_uri, name, parent_id, created_at) VALUES (?, ?, NULL, datetime('now'))",
  ).run(siteUri, `${siteName} Images`);
}

export function handleSyncSiteRoster(req: Request, res: Response): void {
  const did = (req as Request & { userDid: string }).userDid;
  const { siteUri, siteName, memberDids } = req.body as {
    siteUri?: unknown;
    siteName?: unknown;
    memberDids?: unknown;
  };

  if (typeof siteUri !== "string" || !siteUri.startsWith("at://")) {
    res.status(400).json({ error: "siteUri must be an at:// URI" });
    return;
  }
  if (typeof siteName !== "string" || !siteName.trim()) {
    res.status(400).json({ error: "siteName is required" });
    return;
  }
  if (!Array.isArray(memberDids) || !memberDids.every((d) => typeof d === "string")) {
    res.status(400).json({ error: "memberDids must be an array of strings" });
    return;
  }

  const ownerDid = parseSiteOwnerDid(siteUri);
  if (!ownerDid || ownerDid !== did) {
    res.status(403).json({ error: "Only the site owner can sync its roster" });
    return;
  }

  ensureSiteFolder(siteUri, siteName);

  const replaceRoster = db.transaction((dids: string[]) => {
    db.prepare("DELETE FROM site_rosters WHERE site_uri = ?").run(siteUri);
    const insert = db.prepare("INSERT INTO site_rosters (site_uri, member_did) VALUES (?, ?)");
    for (const memberDid of dids) {
      insert.run(siteUri, memberDid);
    }
  });
  replaceRoster(memberDids);

  res.json({ ok: true });
}
