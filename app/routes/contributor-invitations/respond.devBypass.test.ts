import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./respond";
import { requireAuth } from "~/services/auth.server";
import { acceptInvitation, rejectInvitation } from "~/services/contributorRoster.server";

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  useRealOAuth: false,
}));

vi.mock("~/services/contributorRoster.server", () => ({
  acceptInvitation: vi.fn(),
  rejectInvitation: vi.fn(),
}));

const DID = "did:dev:contributor";
const SITE_URI = "at://did:plc:owner/site.standard.publication/my-site";

function callAction(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  const request = new Request("http://localhost/contributor-invitations/respond", {
    method: "POST",
    body: formData,
  });
  return action({ request } as unknown as Parameters<typeof action>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(acceptInvitation).mockReset();
  vi.mocked(rejectInvitation).mockReset();
});

describe("action — dev-bypass path", () => {
  it("returns the optimistic literal without calling either module function", async () => {
    await expect(
      callAction({ _intent: "acceptInvitation", siteUri: SITE_URI }),
    ).resolves.toEqual({ ok: true });
    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(rejectInvitation).not.toHaveBeenCalled();
  });
});
