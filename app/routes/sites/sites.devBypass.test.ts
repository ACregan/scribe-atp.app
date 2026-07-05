import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader, action } from "./sites";
import { requireAuth, getAtpAgent } from "~/services/auth.server";
import { devSitesLoader } from "~/services/devFixtures.server";

// Characterization tests for the sites route's dev-bypass path (useRealOAuth:
// false). Companion to sites.real.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: false,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DID = "did:dev:testuser";

function makeRequest(entries: Record<string, string> = {}): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/sites", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({ request: makeRequest(entries) } as unknown as Parameters<
    typeof action
  >[0]);
}

function callLoader() {
  return loader({
    request: new Request("http://localhost/sites"),
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockClear();
});

describe("loader — dev bypass", () => {
  it("returns the dev fixture without touching the agent", async () => {
    await expect(callLoader()).resolves.toEqual(devSitesLoader());
    expect(getAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action — dev bypass", () => {
  it("createSite: validates, then returns ok without touching the agent", async () => {
    await expect(
      callAction({ _intent: "createSite", title: "", url: "" }),
    ).resolves.toEqual({ ok: false, error: "Title is required." });

    await expect(
      callAction({
        _intent: "createSite",
        title: "My Site",
        url: "my.example.com",
      }),
    ).resolves.toEqual({ ok: true });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("deleteSite: returns ok without touching the agent", async () => {
    await expect(
      callAction({ _intent: "deleteSite", rkey: "my-site" }),
    ).resolves.toEqual({ ok: true });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });
});
