import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader } from "./site-list";
import { requireAtpAgent } from "~/services/auth.server";
import { fetchBskyProfiles } from "~/services/blueskyProfile.server";
import { db, pendingSubmissions } from "~/services/db.server";
import * as contributorRoster from "~/services/contributorRoster.server";

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

const DID = "did:plc:testuser";
const SITE_SLUG = "my-site";
const SITE_URI = `at://${DID}/site.standard.publication/${SITE_SLUG}`;

function makeAgent(siteScribe: Record<string, unknown>) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord: vi.fn().mockResolvedValue({
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
  db.exec("DELETE FROM pending_submissions");
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
