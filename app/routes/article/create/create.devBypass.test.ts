import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader, action } from "./create";
import { requireAtpAgent } from "~/services/auth.server";
import { devCreateLoader } from "~/services/devFixtures.server";

// Characterization tests for the create-article route's dev-bypass path
// (useRealOAuth: false). Companion to create.real.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: false,
}));

function makeRequest(url: string, entries?: Record<string, string>): Request {
  if (!entries) return new Request(url);
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request(url, { method: "POST", body: formData });
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest("http://localhost/article/create", entries),
  } as unknown as Parameters<typeof action>[0]);
}

function callLoader(url = "http://localhost/article/create") {
  return loader({ request: makeRequest(url) } as unknown as Parameters<
    typeof loader
  >[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockClear();
});

describe("loader — dev bypass", () => {
  it("returns the dev fixture without touching the agent", async () => {
    await expect(callLoader()).resolves.toEqual(devCreateLoader());
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action — dev bypass", () => {
  it("validates, then returns the dev-mode payload without touching the agent", async () => {
    await expect(
      callAction({ title: "", url: "my-article", content: "<p>hi</p>" }),
    ).resolves.toEqual({ error: "Title is required." });

    await expect(
      callAction({
        title: "My Article",
        url: "my-article",
        content: "<p>hi</p>",
      }),
    ).resolves.toEqual({
      slug: "my-article",
      devMode: true,
      title: "My Article",
    });
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});
