import { describe, it, expect, beforeEach } from "vitest";
import { db, contributorMemberships } from "./db.server";

// Uses the real (in-memory, per test.setup.ts) SQLite database — this table
// has no mock-worthy external dependency, unlike auth.server.ts's PDS calls.

const CONTRIBUTOR_DID = "did:plc:contributor";
const SITE_URI = "at://did:plc:owner/site.standard.publication/abc123";

beforeEach(() => {
  db.exec("DELETE FROM contributor_memberships");
});

describe("contributorMemberships", () => {
  it("returns undefined for a membership that doesn't exist", () => {
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)).toBeUndefined();
  });

  it("upsert creates a row with the given status and addedAt", () => {
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      SITE_URI,
      "2026-07-15T00:00:00.000Z",
      "invited",
    );
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)).toEqual({
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      addedAt: "2026-07-15T00:00:00.000Z",
      status: "invited",
    });
  });

  it("upsert on an existing row overwrites status and addedAt rather than duplicating", () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-07-15T00:00:00.000Z", "invited");
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-07-16T00:00:00.000Z", "accepted");
    expect(contributorMemberships.listForSite(SITE_URI)).toHaveLength(1);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)?.status).toBe("accepted");
  });

  it("setStatus flips status without touching addedAt", () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-07-15T00:00:00.000Z", "invited");
    contributorMemberships.setStatus(CONTRIBUTOR_DID, SITE_URI, "rejected");
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)).toEqual({
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      addedAt: "2026-07-15T00:00:00.000Z",
      status: "rejected",
    });
  });

  it("remove deletes the row", () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-07-15T00:00:00.000Z", "invited");
    contributorMemberships.remove(CONTRIBUTOR_DID, SITE_URI);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)).toBeUndefined();
  });

  it("listForContributor returns every site a DID has a row for", () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-07-15T00:00:00.000Z", "invited");
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      "at://did:plc:otherowner/site.standard.publication/xyz",
      "2026-07-15T00:00:00.000Z",
      "accepted",
    );
    contributorMemberships.upsert(
      "did:plc:someoneelse",
      SITE_URI,
      "2026-07-15T00:00:00.000Z",
      "invited",
    );
    const rows = contributorMemberships.listForContributor(CONTRIBUTOR_DID);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.contributorDid === CONTRIBUTOR_DID)).toBe(true);
  });

  it("listForSite returns every row for a given site regardless of contributor", () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-07-15T00:00:00.000Z", "invited");
    contributorMemberships.upsert("did:plc:someoneelse", SITE_URI, "2026-07-15T00:00:00.000Z", "accepted");
    const rows = contributorMemberships.listForSite(SITE_URI);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.siteUri === SITE_URI)).toBe(true);
  });
});
