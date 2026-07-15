import { describe, it, expect, beforeEach } from "vitest";
import { db, pendingSubmissions } from "./db.server";

const DOCUMENT_URI = "at://did:plc:contributor/site.standard.document/abc123";
const CONTRIBUTOR_DID = "did:plc:contributor";
const SITE_URI = "at://did:plc:owner/site.standard.publication/my-site";
const OWNER_DID = "did:plc:owner";

beforeEach(() => {
  db.exec("DELETE FROM pending_submissions");
});

describe("pendingSubmissions", () => {
  it("returns undefined for a submission that doesn't exist", () => {
    expect(pendingSubmissions.get(DOCUMENT_URI)).toBeUndefined();
  });

  it("create writes a row with status:pending and no rejection reason", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "2026-07-16T00:00:00.000Z",
    );
    expect(pendingSubmissions.get(DOCUMENT_URI)).toEqual({
      documentUri: DOCUMENT_URI,
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      ownerDid: OWNER_DID,
      submittedAt: "2026-07-16T00:00:00.000Z",
      status: "pending",
      rejectionReason: null,
    });
  });

  it("reject sets status and the reason without touching other fields", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.reject(DOCUMENT_URI, "Not a good fit for this site.");
    expect(pendingSubmissions.get(DOCUMENT_URI)).toEqual({
      documentUri: DOCUMENT_URI,
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      ownerDid: OWNER_DID,
      submittedAt: "2026-07-16T00:00:00.000Z",
      status: "rejected",
      rejectionReason: "Not a good fit for this site.",
    });
  });

  it("remove deletes the row", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.remove(DOCUMENT_URI);
    expect(pendingSubmissions.get(DOCUMENT_URI)).toBeUndefined();
  });

  it("enforces one submission per document — a second create for the same document_uri throws", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "2026-07-16T00:00:00.000Z",
    );
    expect(() =>
      pendingSubmissions.create(
        DOCUMENT_URI,
        CONTRIBUTOR_DID,
        "at://did:plc:otherowner/site.standard.publication/other-site",
        "did:plc:otherowner",
        "2026-07-16T01:00:00.000Z",
      ),
    ).toThrow();
  });

  it("listForOwner returns every submission for that owner's sites, regardless of contributor", () => {
    pendingSubmissions.create(
      DOCUMENT_URI,
      CONTRIBUTOR_DID,
      SITE_URI,
      OWNER_DID,
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.create(
      "at://did:plc:othercontributor/site.standard.document/xyz",
      "did:plc:othercontributor",
      SITE_URI,
      OWNER_DID,
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.create(
      "at://did:plc:contributor/site.standard.document/unrelated",
      CONTRIBUTOR_DID,
      "at://did:plc:differentowner/site.standard.publication/different-site",
      "did:plc:differentowner",
      "2026-07-16T00:00:00.000Z",
    );

    const rows = pendingSubmissions.listForOwner(OWNER_DID);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ownerDid === OWNER_DID)).toBe(true);
  });
});
