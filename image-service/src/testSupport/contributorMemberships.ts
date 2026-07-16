import { getCmsDb } from "../db.js";

// ADR 0024 — access.ts reads contributor_memberships from the CMS's own
// database live. In production that's a real cross-process file; in tests
// CMS_DB_PATH is ":memory:" (test.setup.ts), so getCmsDb() here is an
// in-memory database this test process owns outright and must create its
// own schema for — this is that shared setup, used by every image-service
// test that needs to simulate an accepted (or invited) Contributor.

export function setupContributorMembershipsTable(): void {
  getCmsDb().exec(`
    CREATE TABLE IF NOT EXISTS contributor_memberships (
      contributor_did TEXT NOT NULL,
      site_uri         TEXT NOT NULL,
      added_at         TEXT NOT NULL,
      status           TEXT NOT NULL,
      PRIMARY KEY (contributor_did, site_uri)
    );
  `);
}

export function clearContributorMemberships(): void {
  getCmsDb().exec("DELETE FROM contributor_memberships");
}

export function insertContributorMembership(
  siteUri: string,
  contributorDid: string,
  status: string = "accepted",
): void {
  getCmsDb()
    .prepare(
      "INSERT INTO contributor_memberships (contributor_did, site_uri, added_at, status) VALUES (?, ?, ?, ?)",
    )
    .run(contributorDid, siteUri, new Date().toISOString(), status);
}
