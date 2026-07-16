import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Agent } from "@atproto/api";
import { loader } from "./core";
import { getAuthSession, getAtpAgent } from "~/services/auth.server";
import {
  listPendingInvitations,
  reconcileContributorStatuses,
} from "~/services/contributorRoster.server";
import { db, pendingSubmissions } from "~/services/db.server";

// Phase 4 (discovery UX polish) — loader-only tests for the new
// pendingSubmissionsCount/newSubmissions fields, plus the global
// per-owned-site reconciliation loop added after the live test pass found
// scribe.contributors (the public record) could go stale indefinitely if
// the Owner never happened to visit that one site's own
// /article/list/:siteSlug page. This no longer gates Image Library access
// (ADR 0024 — that reads contributor_memberships live instead); it exists
// purely to keep the public PDS record correct. core.tsx's component tree
// (AsideMenu, ToastProvider, etc.) is not exercised here — this is purely
// the data side.

vi.mock("~/services/auth.server", () => ({
  getAuthSession: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/theme.server", () => ({
  getTheme: () => "light",
}));

vi.mock("~/services/contributorRoster.server", () => ({
  listPendingInvitations: vi.fn(),
  reconcileContributorStatuses: vi.fn(),
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DID = "did:plc:testuser";

function siteRecord(rkey: string) {
  return {
    uri: `at://${DID}/site.standard.publication/${rkey}`,
    cid: `${rkey}-cid`,
    value: { scribe: { title: rkey } },
  };
}

function makeAgent(
  listRecordsImpl: (args: {
    collection: string;
  }) => Promise<{ data: { records: unknown[] } }>,
) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords: vi.fn().mockImplementation(listRecordsImpl),
        },
      },
    },
  };
}

function makeAgentWithSites(siteRkeys: string[]) {
  return makeAgent(({ collection }) => {
    if (collection === "site.standard.publication") {
      return Promise.resolve({ data: { records: siteRkeys.map(siteRecord) } });
    }
    return Promise.resolve({ data: { records: [] } });
  });
}

function callLoader() {
  return loader({
    request: new Request("http://localhost/"),
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(getAuthSession).mockReset();
  vi.mocked(getAtpAgent).mockReset();
  vi.mocked(listPendingInvitations).mockReset().mockResolvedValue([]);
  vi.mocked(reconcileContributorStatuses).mockReset().mockResolvedValue(undefined);
  db.exec("DELETE FROM pending_submissions");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("core.tsx loader — pendingSubmissionsCount / newSubmissions", () => {
  it("returns zero/empty when not authenticated", async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      isAuthenticated: false,
      did: undefined,
      handle: undefined,
    } as never);

    const result = await callLoader();

    expect(result.pendingSubmissionsCount).toBe(0);
    expect(result.newSubmissions).toEqual([]);
  });

  it("computes the count and list from pendingSubmissions.listForOwner, filtered to status: pending", async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      isAuthenticated: true,
      did: DID,
      handle: "testuser.bsky.social",
    } as never);
    const agent = makeAgent(() => Promise.resolve({ data: { records: [] } }));
    vi.mocked(getAtpAgent).mockResolvedValue(agent as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    pendingSubmissions.create(
      "at://did:plc:contributor/site.standard.document/abc",
      "did:plc:contributor",
      "at://did:plc:testuser/site.standard.publication/site-a",
      DID,
      "Pending Article",
      "2026-07-16T00:00:00.000Z",
    );
    const rejectedUri = "at://did:plc:contributor/site.standard.document/def";
    pendingSubmissions.create(
      rejectedUri,
      "did:plc:contributor",
      "at://did:plc:testuser/site.standard.publication/site-a",
      DID,
      "Rejected Article",
      "2026-07-16T00:00:00.000Z",
    );
    pendingSubmissions.reject(rejectedUri, "Not a fit");

    const result = await callLoader();

    expect(result.pendingSubmissionsCount).toBe(1);
    expect(result.newSubmissions).toEqual([
      {
        documentUri: "at://did:plc:contributor/site.standard.document/abc",
        documentTitle: "Pending Article",
      },
    ]);
  });

  it("returns zero/empty when the Owner has no pending submissions", async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      isAuthenticated: true,
      did: DID,
      handle: "testuser.bsky.social",
    } as never);
    const agent = makeAgent(() => Promise.resolve({ data: { records: [] } }));
    vi.mocked(getAtpAgent).mockResolvedValue(agent as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await callLoader();

    expect(result.pendingSubmissionsCount).toBe(0);
    expect(result.newSubmissions).toEqual([]);
  });
});

// Found live 2026-07-16: reconciliation used to only run from the specific
// site's own /article/list/:siteSlug loader — an Owner with no reason to
// visit that exact page could leave a newly-accepted Contributor without
// Image Library folder access indefinitely. Runs here instead so any page
// load anywhere finalizes it.
describe("core.tsx loader — global per-owned-site reconciliation", () => {
  beforeEach(() => {
    vi.mocked(getAuthSession).mockResolvedValue({
      isAuthenticated: true,
      did: DID,
      handle: "testuser.bsky.social",
    } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  it("calls reconcileContributorStatuses once per owned site", async () => {
    const agent = makeAgentWithSites(["site-a", "site-b"]);
    vi.mocked(getAtpAgent).mockResolvedValue(agent as never);

    await callLoader();

    expect(reconcileContributorStatuses).toHaveBeenCalledTimes(2);
    expect(reconcileContributorStatuses).toHaveBeenCalledWith(agent, DID, "site-a");
    expect(reconcileContributorStatuses).toHaveBeenCalledWith(agent, DID, "site-b");
  });

  it("does not call reconcileContributorStatuses when the Owner has no sites", async () => {
    const agent = makeAgentWithSites([]);
    vi.mocked(getAtpAgent).mockResolvedValue(agent as never);

    await callLoader();

    expect(reconcileContributorStatuses).not.toHaveBeenCalled();
  });

  it("a reconciliation failure for one site doesn't break the page load or block other sites", async () => {
    const agent = makeAgentWithSites(["site-a", "site-b"]);
    vi.mocked(getAtpAgent).mockResolvedValue(agent as never);
    vi.mocked(reconcileContributorStatuses).mockImplementation((_agent, _did, siteRkey) =>
      siteRkey === "site-a"
        ? Promise.reject(new Error("PDS down"))
        : Promise.resolve(undefined),
    );

    const result = await callLoader();

    expect(result.isAuthenticated).toBe(true);
    expect(reconcileContributorStatuses).toHaveBeenCalledTimes(2);
  });
});
