import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader } from "./site-list";
import { requireAtpAgent } from "~/services/auth.server";
import { fetchBskyProfiles } from "~/services/blueskyProfile.server";
import { db, pendingSubmissions, contributorMemberships } from "~/services/db.server";
import * as contributorRoster from "~/services/contributorRoster.server";
import { getPublicSiteRecord } from "~/services/submissionReview.server";

// Loader tests scoped to the new submissions wiring (ADR 0022 point 6) —
// dispatch/formData/action-intent coverage for this route already lives in
// site-list.action.real.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  rethrowIfRedirect: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/blueskyProfile.server", () => ({
  fetchBskyProfiles: vi.fn(),
}));

vi.mock("~/services/contributorRoster.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/contributorRoster.server")>();
  return {
    ...actual,
    reconcileContributorStatuses: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("~/services/submissionReview.server", () => ({
  getPublicSiteRecord: vi.fn(),
}));

const DID = "did:plc:testuser";
const SITE_SLUG = "my-site";
const SITE_URI = `at://${DID}/site.standard.publication/${SITE_SLUG}`;

function makeAgent(
  siteScribe: Record<string, unknown>,
  overrides: { getRecord?: ReturnType<typeof vi.fn> } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord:
            overrides.getRecord ??
            vi.fn().mockResolvedValue({
              data: { cid: "site-cid", value: { scribe: siteScribe } },
            }),
          listRecords: vi.fn().mockResolvedValue({ data: { records: [] } }),
        },
      },
    },
  } as unknown as Agent;
}

function callLoader() {
  return loader({
    request: new Request(`http://localhost/article/list/${SITE_SLUG}`),
    params: { siteSlug: SITE_SLUG },
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockReset().mockResolvedValue({
    agent: makeAgent({ title: "My Site", groups: [] }),
    did: DID,
    handle: DID,
  });
  vi.mocked(fetchBskyProfiles).mockReset().mockResolvedValue([]);
  vi.mocked(contributorRoster.reconcileContributorStatuses).mockReset().mockResolvedValue(undefined);
  vi.mocked(getPublicSiteRecord).mockReset();
  db.exec("DELETE FROM pending_submissions");
  db.exec("DELETE FROM contributor_memberships");
});

describe("loader — submissions", () => {
  it("includes a pending submission for this site", async () => {
    pendingSubmissions.create(
      `at://did:plc:contributor/site.standard.document/abc`,
      "did:plc:contributor",
      SITE_URI,
      DID,
      "A Submitted Article",
      "2026-07-16T00:00:00.000Z",
    );

    const result = await callLoader();

    expect(result.submissions).toEqual([
      expect.objectContaining({
        contributorDid: "did:plc:contributor",
        rkey: "abc",
        documentTitle: "A Submitted Article",
      }),
    ]);
  });

  it("excludes a rejected submission — it's not this Owner's to act on again", async () => {
    const documentUri = `at://did:plc:contributor/site.standard.document/abc`;
    pendingSubmissions.create(
      documentUri,
      "did:plc:contributor",
      SITE_URI,
      DID,
      "A Submitted Article",
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.reject(documentUri, "not a fit");

    const result = await callLoader();

    expect(result.submissions).toEqual([]);
  });

  it("excludes a submission for a different site owned by the same Owner", async () => {
    pendingSubmissions.create(
      `at://did:plc:contributor/site.standard.document/xyz`,
      "did:plc:contributor",
      `at://${DID}/site.standard.publication/other-site`,
      DID,
      "Unrelated Article",
      "2026-07-16T00:00:00.000Z",
    );

    const result = await callLoader();

    expect(result.submissions).toEqual([]);
  });

  it("resolves each submitting Contributor's profile, de-duped against the roster fetch", async () => {
    pendingSubmissions.create(
      `at://did:plc:contributor/site.standard.document/abc`,
      "did:plc:contributor",
      SITE_URI,
      DID,
      "A Submitted Article",
      "2026-07-16T00:00:00.000Z",
    );
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: makeAgent({
        title: "My Site",
        groups: [],
        contributors: [
          { did: "did:plc:contributor", addedAt: "2026-07-01T00:00:00.000Z", status: "accepted" },
        ],
      }),
      did: DID,
      handle: DID,
    });
    vi.mocked(fetchBskyProfiles).mockResolvedValue([
      { did: "did:plc:contributor", handle: "contributor.bsky.social", displayName: "Cora Tributor" },
    ]);

    const result = await callLoader();

    expect(fetchBskyProfiles).toHaveBeenCalledWith(["did:plc:contributor"]);
    expect(result.submissions[0]).toEqual(
      expect.objectContaining({
        contributorHandle: "contributor.bsky.social",
        contributorDisplayName: "Cora Tributor",
      }),
    );
  });
});

// Found live 2026-07-17: this page was Owner-only by accident — a
// Contributor has no repo of their own at this rkey, so their real visits
// hit the "not found" fallback below. Read-only access resolves via their
// own accepted contributor_memberships row instead.
describe("loader — Contributor read-only access", () => {
  const CONTRIBUTOR_DID = "did:plc:contributor";

  it("returns isOwner: true and the caller's own did for a normal Owner visit", async () => {
    const result = await callLoader();
    expect(result.isOwner).toBe(true);
    expect(result.authorDid).toBe(DID);
    expect(result.siteOwnerDid).toBe(DID);
  });

  it("falls back to a public cross-repo read when the caller has an accepted membership for this site", async () => {
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      SITE_URI,
      "2026-07-01T00:00:00.000Z",
      "accepted",
    );
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: makeAgent(
        {},
        { getRecord: vi.fn().mockRejectedValue(new Error("RecordNotFound")) },
      ),
      did: CONTRIBUTOR_DID,
      handle: CONTRIBUTOR_DID,
    });
    vi.mocked(getPublicSiteRecord).mockResolvedValue({
      scribe: { title: "Owner's Site", groups: [], contributors: [] },
    });

    const result = await callLoader();

    expect(getPublicSiteRecord).toHaveBeenCalledWith(DID, SITE_SLUG);
    expect(result.isOwner).toBe(false);
    expect(result.authorDid).toBe(CONTRIBUTOR_DID);
    expect(result.siteOwnerDid).toBe(DID);
    expect(result.site.title).toBe("Owner's Site");
    // Owner-only concerns are skipped entirely for a read-only visit.
    expect(result.hasUnassignedArticles).toBe(false);
    expect(result.submissions).toEqual([]);
    expect(contributorRoster.reconcileContributorStatuses).not.toHaveBeenCalled();
  });

  it("redirects to /sites when the caller has no accepted membership for this site", async () => {
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: makeAgent(
        {},
        { getRecord: vi.fn().mockRejectedValue(new Error("RecordNotFound")) },
      ),
      did: CONTRIBUTOR_DID,
      handle: CONTRIBUTOR_DID,
    });

    const thrown = await callLoader().catch((err) => err);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect(getPublicSiteRecord).not.toHaveBeenCalled();
  });

  it("redirects to /sites when the membership exists but is still only invited, not accepted", async () => {
    contributorMemberships.upsert(
      CONTRIBUTOR_DID,
      SITE_URI,
      "2026-07-01T00:00:00.000Z",
      "invited",
    );
    vi.mocked(requireAtpAgent).mockResolvedValue({
      agent: makeAgent(
        {},
        { getRecord: vi.fn().mockRejectedValue(new Error("RecordNotFound")) },
      ),
      did: CONTRIBUTOR_DID,
      handle: CONTRIBUTOR_DID,
    });

    const thrown = await callLoader().catch((err) => err);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
  });
});
