// One-shot backfill (ADR 0024). Sites created before this changeset's
// at-creation-time folder auto-create have no Image Library folder at all —
// this script creates the missing ones retroactively.
//
// Restores every DID that has a stored OAuth session directly via
// oauthClient.restore(did) (the same tokens the running app itself uses —
// no live login needed), lists each account's sites, and inserts an
// image_folders row for any site that doesn't already have one. Mirrors
// ensureSiteFolder in image-service/src/siteFolder.ts exactly (same table,
// same idempotent "insert if missing" check) — writing directly to
// data/images.db rather than going through the HTTP endpoint, since the
// script already has trusted local filesystem access and the endpoint's
// only other job (auth) doesn't apply to an offline maintenance script.
// Safe to re-run: a site that already has a folder is skipped.
//
// Usage: npx tsx --env-file=.env scripts/backfill-site-image-folders.ts
//
// One-time tool — delete this file (and this script) once run against every
// deployment that has pre-existing sites, per this repo's own convention for
// one-off repair tools (see the "chore: remove devtools/repair-*" history).

import Database from "better-sqlite3";
import path from "node:path";
import { db as cmsDb } from "~/services/db.server";
import { oauthClient } from "~/services/auth.server";
import { listSites } from "~/services/siteRepository.server";
import { Agent } from "@atproto/api";

const imageDbPath =
  process.env.IMAGE_DB_PATH ?? path.resolve(process.cwd(), "data/images.db");
const imageDb = new Database(imageDbPath);

function ensureSiteFolder(siteUri: string, siteName: string): "created" | "already-exists" {
  const existing = imageDb
    .prepare("SELECT id FROM image_folders WHERE site_uri = ? AND parent_id IS NULL")
    .get(siteUri);
  if (existing) return "already-exists";

  imageDb
    .prepare(
      "INSERT INTO image_folders (site_uri, name, parent_id, created_at) VALUES (?, ?, NULL, datetime('now'))",
    )
    .run(siteUri, `${siteName} Images`);
  return "created";
}

async function main() {
  const dids = (
    cmsDb.prepare("SELECT key FROM oauth_session").all() as { key: string }[]
  ).map((row) => row.key);

  console.log(`Found ${dids.length} DID(s) with a stored OAuth session.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const did of dids) {
    let agent: Agent;
    try {
      const session = await oauthClient.restore(did);
      agent = new Agent(session);
    } catch (err) {
      console.warn(`  [${did}] could not restore session — skipping:`, String(err));
      failed++;
      continue;
    }

    try {
      const sites = await listSites(agent, did);
      for (const site of sites) {
        const scribe = (site.value.scribe as Record<string, unknown>) ?? {};
        const siteName = String(scribe.domain ?? scribe.title ?? site.rkey);
        const result = ensureSiteFolder(site.uri, siteName);
        if (result === "created") {
          console.log(`  [${did}] created folder for ${siteName} (${site.uri})`);
          created++;
        } else {
          skipped++;
        }
      }
    } catch (err) {
      console.warn(`  [${did}] failed to list/backfill sites:`, String(err));
      failed++;
    }
  }

  console.log(
    `\nDone. ${created} folder(s) created, ${skipped} already existed, ${failed} DID(s) failed.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
