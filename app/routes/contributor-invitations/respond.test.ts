import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./respond";
import { requireAuth } from "~/services/auth.server";
import { acceptInvitation, rejectInvitation } from "~/services/contributorRoster.server";

// Dispatch-only smoke tests, same convention as site-list.action.real.test.ts
// — this route has no I/O of its own beyond the two local-only calls it
// delegates to (no agent, no PDS call — see the route's own comment for why).

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  useRealOAuth: true,
}));

vi.mock("~/services/contributorRoster.server", () => ({
  acceptInvitation: vi.fn(),
  rejectInvitation: vi.fn(),
}));

const DID = "did:plc:contributor";
const SITE_URI = "at://did:plc:owner/site.standard.publication/my-site";

function makeRequest(entries: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/contributor-invitations/respond", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest(entries),
  } as unknown as Parameters<typeof action>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(acceptInvitation).mockReset();
  vi.mocked(rejectInvitation).mockReset();
});

describe("action — acceptInvitation", () => {
  it("rejects a missing siteUri without calling the module", async () => {
    await expect(
      callAction({ _intent: "acceptInvitation", siteUri: "" }),
    ).resolves.toEqual({ ok: false, error: "Missing site." });
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("calls acceptInvitation with the logged-in DID and the given siteUri", async () => {
    await expect(
      callAction({ _intent: "acceptInvitation", siteUri: SITE_URI }),
    ).resolves.toEqual({ ok: true });
    expect(acceptInvitation).toHaveBeenCalledWith(DID, SITE_URI);
    expect(rejectInvitation).not.toHaveBeenCalled();
  });
});

describe("action — rejectInvitation", () => {
  it("calls rejectInvitation with the logged-in DID and the given siteUri", async () => {
    await expect(
      callAction({ _intent: "rejectInvitation", siteUri: SITE_URI }),
    ).resolves.toEqual({ ok: true });
    expect(rejectInvitation).toHaveBeenCalledWith(DID, SITE_URI);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });
});

describe("action — unknown intent", () => {
  it("returns an error without calling either module function", async () => {
    await expect(
      callAction({ _intent: "somethingElse", siteUri: SITE_URI }),
    ).resolves.toEqual({ ok: false, error: "Unknown intent." });
    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(rejectInvitation).not.toHaveBeenCalled();
  });
});
