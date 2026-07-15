import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import {
  inviteContributor,
  removeContributor,
  acceptInvitation,
  rejectInvitation,
  reconcileContributorStatuses,
} from "./contributorRoster.server";
import { db, contributorMemberships } from "./db.server";

// Mirrors the makeAgent/siteRecord helpers in siteManifest.server.test.ts —
// same mocking shape, kept local since this is a separate module.

const DID = "did:plc:owner";
const SITE_SLUG = "my-site";
const SITE_URI = `at://${DID}/site.standard.publication/${SITE_SLUG}`;
const CONTRIBUTOR_DID = "did:plc:contributor";

function makeAgent(
  overrides: {
    getRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord: overrides.getRecord ?? vi.fn(),
          putRecord:
            overrides.putRecord ??
            vi.fn().mockResolvedValue({ data: { cid: "new-cid" } }),
        },
      },
    },
  } as unknown as Agent;
}

function siteRecord(scribe: Record<string, unknown>) {
  return {
    data: {
      cid: "site-cid",
      value: { $type: "site.standard.publication", scribe },
    },
  };
}

beforeEach(() => {
  db.exec("DELETE FROM contributor_memberships");
});

describe("inviteContributor", () => {
  it("appends a status:invited entry and writes the local membership row", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(siteRecord({ contributors: [] })),
      putRecord,
    });

    const result = await inviteContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    expect(result).toEqual({ ok: true });
    const written = putRecord.mock.calls[0][0].record.scribe;
    expect(written.contributors).toEqual([
      { did: CONTRIBUTOR_DID, addedAt: expect.any(String), status: "invited" },
    ]);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)).toEqual({
      contributorDid: CONTRIBUTOR_DID,
      siteUri: SITE_URI,
      addedAt: written.contributors[0].addedAt,
      status: "invited",
    });
  });

  it("rejects inviting the site owner's own DID", async () => {
    const agent = makeAgent();
    const result = await inviteContributor(agent, DID, SITE_SLUG, DID);
    expect(result).toEqual({ error: expect.stringContaining("yourself") });
  });

  it("rejects a DID already on the roster, regardless of status", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({
          contributors: [
            { did: CONTRIBUTOR_DID, addedAt: "2026-01-01T00:00:00.000Z", status: "accepted" },
          ],
        }),
      ),
    });

    const result = await inviteContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    expect(result).toEqual({ error: expect.stringContaining("already on the roster") });
  });

  it("surfaces a swapRecord conflict as a caught error, not an uncaught throw", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(siteRecord({ contributors: [] })),
      putRecord: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("InvalidSwap"), { status: 409 })),
    });

    const result = await inviteContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    expect(result).toEqual({ error: expect.stringContaining("Failed to invite contributor") });
  });
});

describe("removeContributor", () => {
  it("filters the entry out of scribe.contributors and deletes the local row", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "accepted");
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({
          contributors: [
            { did: CONTRIBUTOR_DID, addedAt: "2026-01-01T00:00:00.000Z", status: "accepted" },
          ],
        }),
      ),
      putRecord,
    });

    const result = await removeContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    expect(result).toEqual({ ok: true });
    expect(putRecord.mock.calls[0][0].record.scribe.contributors).toEqual([]);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)).toBeUndefined();
  });

  it("returns ok:false rather than throwing when the write fails", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(siteRecord({ contributors: [] })),
      putRecord: vi.fn().mockRejectedValue(new Error("InvalidSwap")),
    });

    const result = await removeContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    expect(result).toEqual({ ok: false, error: expect.any(Error) });
  });
});

describe("acceptInvitation / rejectInvitation", () => {
  it("accept flips the local row to accepted without any AT Protocol call", () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "invited");
    acceptInvitation(CONTRIBUTOR_DID, SITE_URI);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)?.status).toBe("accepted");
  });

  it("reject flips the local row to rejected without any AT Protocol call", () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "invited");
    rejectInvitation(CONTRIBUTOR_DID, SITE_URI);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)?.status).toBe("rejected");
  });
});

describe("reconcileContributorStatuses", () => {
  it("is a no-op — no getRecord/putRecord call — when nothing is accepted or rejected locally", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "invited");
    const getRecord = vi.fn();
    const putRecord = vi.fn();
    const agent = makeAgent({ getRecord, putRecord });

    await reconcileContributorStatuses(agent, DID, SITE_SLUG);

    expect(getRecord).not.toHaveBeenCalled();
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("promotes an accepted row's status in scribe.contributors and keeps the local row", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "accepted");
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({
          contributors: [
            { did: CONTRIBUTOR_DID, addedAt: "2026-01-01T00:00:00.000Z", status: "invited" },
          ],
        }),
      ),
      putRecord,
    });

    await reconcileContributorStatuses(agent, DID, SITE_SLUG);

    expect(putRecord.mock.calls[0][0].record.scribe.contributors).toEqual([
      { did: CONTRIBUTOR_DID, addedAt: "2026-01-01T00:00:00.000Z", status: "accepted" },
    ]);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)?.status).toBe("accepted");
  });

  it("strips a rejected row out of scribe.contributors and deletes the local row", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "rejected");
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({
          contributors: [
            { did: CONTRIBUTOR_DID, addedAt: "2026-01-01T00:00:00.000Z", status: "invited" },
          ],
        }),
      ),
      putRecord,
    });

    await reconcileContributorStatuses(agent, DID, SITE_SLUG);

    expect(putRecord.mock.calls[0][0].record.scribe.contributors).toEqual([]);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)).toBeUndefined();
  });

  it("handles a mix of accepted and rejected rows for different contributors in one pass", async () => {
    const otherDid = "did:plc:otherperson";
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "accepted");
    contributorMemberships.upsert(otherDid, SITE_URI, "2026-01-01T00:00:00.000Z", "rejected");
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({
          contributors: [
            { did: CONTRIBUTOR_DID, addedAt: "2026-01-01T00:00:00.000Z", status: "invited" },
            { did: otherDid, addedAt: "2026-01-01T00:00:00.000Z", status: "invited" },
          ],
        }),
      ),
      putRecord,
    });

    await reconcileContributorStatuses(agent, DID, SITE_SLUG);

    expect(putRecord.mock.calls[0][0].record.scribe.contributors).toEqual([
      { did: CONTRIBUTOR_DID, addedAt: "2026-01-01T00:00:00.000Z", status: "accepted" },
    ]);
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)?.status).toBe("accepted");
    expect(contributorMemberships.get(otherDid, SITE_URI)).toBeUndefined();
  });
});
