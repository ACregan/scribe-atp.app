import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loader } from "./core";
import { getAuthSession, getAtpAgent } from "~/services/auth.server";
import { listPendingInvitations } from "~/services/contributorRoster.server";
import { db, pendingSubmissions } from "~/services/db.server";

// Phase 4 (discovery UX polish) — loader-only tests for the new
// pendingSubmissionsCount/newSubmissions fields. core.tsx's component tree
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
}));

const DID = "did:plc:testuser";

function makeAgent(listRecordsImpl: () => Promise<{ data: { records: unknown[] } }>) {
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

function callLoader() {
  return loader({
    request: new Request("http://localhost/"),
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(getAuthSession).mockReset();
  vi.mocked(getAtpAgent).mockReset();
  vi.mocked(listPendingInvitations).mockReset().mockResolvedValue([]);
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
