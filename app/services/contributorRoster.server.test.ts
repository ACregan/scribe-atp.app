import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import {
  inviteContributor,
  removeContributor,
  acceptInvitation,
  rejectInvitation,
  reconcileContributorStatuses,
  listPendingInvitations,
  listContributorSites,
} from "./contributorRoster.server";
import { db, contributorMemberships } from "./db.server";
import { fetchBskyProfile } from "~/services/blueskyProfile.server";

// Mirrors the makeAgent/siteRecord helpers in siteManifest.server.test.ts —
// same mocking shape, kept local since this is a separate module.

vi.mock("~/services/auth.server", () => ({ publicUrl: "https://test.example" }));

vi.mock("~/services/blueskyProfile.server", () => ({
  fetchBskyProfile: vi.fn(),
}));

const DID = "did:plc:owner";
const SITE_SLUG = "my-site";
const SITE_URI = `at://${DID}/site.standard.publication/${SITE_SLUG}`;
const CONTRIBUTOR_DID = "did:plc:contributor";

function makeAgent(
  overrides: {
    getRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
    getConvoForMembers?: ReturnType<typeof vi.fn>;
    sendMessage?: ReturnType<typeof vi.fn>;
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
    api: {
      chat: {
        bsky: {
          convo: {
            getConvoForMembers:
              overrides.getConvoForMembers ??
              vi.fn().mockResolvedValue({ data: { convo: { id: "convo-1" } } }),
            sendMessage: overrides.sendMessage ?? vi.fn().mockResolvedValue({}),
          },
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
  vi.mocked(fetchBskyProfile).mockReset().mockResolvedValue({
    did: CONTRIBUTOR_DID,
    handle: "contributor.bsky.social",
    displayName: "Contributor Name",
  } as never);
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

  it("sends an invite DM via the Owner's own agent, not scribe-atp-social (ADR 0019)", async () => {
    const getConvoForMembers = vi
      .fn()
      .mockResolvedValue({ data: { convo: { id: "convo-42" } } });
    const sendMessage = vi.fn().mockResolvedValue({});
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(
        siteRecord({ contributors: [], domain: "norobots.blog" }),
      ),
      getConvoForMembers,
      sendMessage,
    });

    await inviteContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    expect(getConvoForMembers).toHaveBeenCalledWith(
      { members: [CONTRIBUTOR_DID] },
      { headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" } },
    );
    expect(sendMessage).toHaveBeenCalledWith(
      {
        convoId: "convo-42",
        message: {
          $type: "chat.bsky.convo.defs#messageInput",
          text: expect.stringContaining("Contributor Name"),
          facets: [
            {
              index: expect.objectContaining({
                byteStart: expect.any(Number),
                byteEnd: expect.any(Number),
              }),
              features: [
                { $type: "app.bsky.richtext.facet#link", uri: "https://test.example" },
              ],
            },
          ],
        },
      },
      { headers: { "Atproto-Proxy": "did:web:api.bsky.chat#bsky_chat" } },
    );
    const { message } = sendMessage.mock.calls[0][0];
    expect(message.text).toContain("norobots.blog");
    expect(message.text).toContain("https://test.example");
    // The facet's byte range must point at exactly the link substring —
    // confirms the plain-text-link bug (found via a real Bluesky account
    // test, 2026-07-15) is actually fixed, not just present in shape.
    const { byteStart, byteEnd } = message.facets[0].index;
    const linkSubstring = Buffer.from(message.text, "utf8")
      .subarray(byteStart, byteEnd)
      .toString("utf8");
    expect(linkSubstring).toBe("https://test.example");
  });

  it("still returns ok:true when the invite DM fails — the roster write already succeeded", async () => {
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(siteRecord({ contributors: [] })),
      getConvoForMembers: vi.fn().mockRejectedValue(new Error("chat proxy down")),
    });

    const result = await inviteContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    expect(result).toEqual({ ok: true });
    expect(contributorMemberships.get(CONTRIBUTOR_DID, SITE_URI)?.status).toBe("invited");
  });

  it("computes the link facet's byte offsets correctly when displayName has multi-byte characters", async () => {
    vi.mocked(fetchBskyProfile).mockResolvedValue({
      did: CONTRIBUTOR_DID,
      handle: "contributor.bsky.social",
      displayName: "Bjørn 日本語", // multi-byte name preceding the link in the message
    } as never);
    const sendMessage = vi.fn().mockResolvedValue({});
    const agent = makeAgent({
      getRecord: vi.fn().mockResolvedValue(siteRecord({ contributors: [] })),
      sendMessage,
    });

    await inviteContributor(agent, DID, SITE_SLUG, CONTRIBUTOR_DID);

    const { message } = sendMessage.mock.calls[0][0];
    const { byteStart, byteEnd } = message.facets[0].index;
    const linkSubstring = Buffer.from(message.text, "utf8")
      .subarray(byteStart, byteEnd)
      .toString("utf8");
    expect(linkSubstring).toBe("https://test.example");
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
    // ADR 0024 — the Image Service reads this same table live, so deleting
    // the row here is the entire revocation; there's nothing else to sync.
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

// Found live, 2026-07-15: two real accounts on different PDS hosts proved
// agent.com.atproto.repo.getRecord can't read a record hosted on a PDS
// other than the caller's own — so listPendingInvitations resolves the
// Owner's real PDS per-DID (via their DID document) and reads from there
// directly with a plain fetch, no agent. These tests mock global fetch
// rather than the Agent, matching what the function actually calls now.
function mockFetchForSites(
  bySiteRkey: Record<string, { scribe: Record<string, unknown> } | "reject">,
) {
  return vi.fn().mockImplementation((input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("https://plc.directory/")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            service: [{ id: "#atproto_pds", serviceEndpoint: "https://owner-pds.example" }],
          }),
      });
    }
    const rkey = new URL(url).searchParams.get("rkey")!;
    const outcome = bySiteRkey[rkey];
    if (outcome === "reject" || outcome === undefined) {
      return Promise.resolve({ ok: false, status: 400, statusText: "RecordNotFound" });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: outcome }) });
  });
}

describe("listPendingInvitations", () => {
  it("returns site title/domain for each invited-status membership", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "invited");
    vi.stubGlobal(
      "fetch",
      mockFetchForSites({
        "my-site": { scribe: { title: "NoRobots Blog", domain: "norobots.blog" } },
      }),
    );

    const result = await listPendingInvitations(CONTRIBUTOR_DID);

    expect(result).toEqual([
      { siteUri: SITE_URI, siteTitle: "NoRobots Blog", siteDomain: "norobots.blog" },
    ]);
    vi.unstubAllGlobals();
  });

  it("excludes accepted and rejected memberships — only invited is pending", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "accepted");
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      "at://did:plc:otherowner/site.standard.publication/other-site",
      "2026-01-01T00:00:00.000Z",
      "rejected",
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await listPendingInvitations(CONTRIBUTOR_DID);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("drops a site that fails to resolve (different PDS host, RecordNotFound) instead of failing the whole list", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "invited");
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      "at://did:plc:otherowner/site.standard.publication/other-site",
      "2026-01-01T00:00:00.000Z",
      "invited",
    );
    vi.stubGlobal(
      "fetch",
      mockFetchForSites({
        "my-site": { scribe: { title: "NoRobots Blog", domain: "norobots.blog" } },
        "other-site": "reject",
      }),
    );

    const result = await listPendingInvitations(CONTRIBUTOR_DID);

    expect(result).toEqual([
      { siteUri: SITE_URI, siteTitle: "NoRobots Blog", siteDomain: "norobots.blog" },
    ]);
    vi.unstubAllGlobals();
  });

  it("returns an empty array when there are no memberships at all", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await listPendingInvitations(CONTRIBUTOR_DID);
    expect(result).toEqual([]);
    vi.unstubAllGlobals();
  });
});

// ADR 0021 point 3 — shares resolveMembershipSites with listPendingInvitations,
// differing only in which contributor_memberships status it filters for.
describe("listContributorSites", () => {
  it("returns site title/domain/ownerDisplayName for each accepted-status membership", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "accepted");
    vi.mocked(fetchBskyProfile).mockResolvedValue({
      did: DID,
      handle: "owner.bsky.social",
      displayName: "Site Owner",
    } as never);
    vi.stubGlobal(
      "fetch",
      mockFetchForSites({
        "my-site": { scribe: { title: "NoRobots Blog", domain: "norobots.blog" } },
      }),
    );

    const result = await listContributorSites(CONTRIBUTOR_DID);

    expect(result).toEqual([
      {
        siteUri: SITE_URI,
        siteTitle: "NoRobots Blog",
        siteDomain: "norobots.blog",
        ownerDisplayName: "Site Owner",
      },
    ]);
    vi.unstubAllGlobals();
  });

  it("falls back to handle, then DID, when the Owner has no displayName", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "accepted");
    vi.mocked(fetchBskyProfile).mockResolvedValue({
      did: DID,
      handle: "owner.bsky.social",
    } as never);
    vi.stubGlobal(
      "fetch",
      mockFetchForSites({ "my-site": { scribe: { title: "NoRobots Blog", domain: "norobots.blog" } } }),
    );

    const result = await listContributorSites(CONTRIBUTOR_DID);

    expect(result[0].ownerDisplayName).toBe("owner.bsky.social");
    vi.unstubAllGlobals();
  });

  it("excludes invited and rejected memberships — only accepted counts as real Contributor access", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "invited");
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      "at://did:plc:otherowner/site.standard.publication/other-site",
      "2026-01-01T00:00:00.000Z",
      "rejected",
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await listContributorSites(CONTRIBUTOR_DID);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("drops a site that fails to resolve instead of failing the whole list", async () => {
    contributorMemberships.upsert(CONTRIBUTOR_DID, SITE_URI, "2026-01-01T00:00:00.000Z", "accepted");
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      "at://did:plc:otherowner/site.standard.publication/other-site",
      "2026-01-01T00:00:00.000Z",
      "accepted",
    );
    vi.stubGlobal(
      "fetch",
      mockFetchForSites({
        "my-site": { scribe: { title: "NoRobots Blog", domain: "norobots.blog" } },
        "other-site": "reject",
      }),
    );

    const result = await listContributorSites(CONTRIBUTOR_DID);

    expect(result).toHaveLength(1);
    expect(result[0].siteUri).toBe(SITE_URI);
    vi.unstubAllGlobals();
  });
});
