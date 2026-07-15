import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader, action } from "./configure";
import { getAtpAgent, requireAuth } from "~/services/auth.server";
import { devConfigureLoader } from "~/services/devFixtures.server";

// Characterization tests for the configure-site route's dev-bypass path
// (useRealOAuth: false). Companion to configure.real.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: false,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DID = "did:dev:testuser";
const SITE_SLUG = "my-site";

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/site/my-site/configure");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/site/my-site/configure", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest(entries),
    params: { siteSlug: SITE_SLUG },
  } as unknown as Parameters<typeof action>[0]);
}

function callLoader() {
  return loader({
    request: makeRequest(),
    params: { siteSlug: SITE_SLUG },
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockClear();
});

describe("loader — dev bypass", () => {
  it("returns the dev fixture without touching the agent", async () => {
    await expect(callLoader()).resolves.toEqual(devConfigureLoader(SITE_SLUG));
    expect(getAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action — dev bypass", () => {
  it("validates, then returns ok without touching the agent", async () => {
    await expect(callAction({ title: "", url: "" })).resolves.toEqual({
      ok: false,
      error: "Title is required.",
    });

    await expect(
      callAction({ title: "My Site", url: "example.com" }),
    ).resolves.toEqual({ ok: true });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });

  it("resyncImageFolder: returns the optimistic literal without touching the agent", async () => {
    await expect(
      callAction({ _intent: "resyncImageFolder" }),
    ).resolves.toEqual({ ok: true, imageFolderSynced: true });
    expect(getAtpAgent).not.toHaveBeenCalled();
  });
});
