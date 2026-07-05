import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader, action } from "./edit";
import { requireAtpAgent } from "~/services/auth.server";
import { devEditLoader } from "~/services/devFixtures.server";

// Characterization tests for the edit-article route's dev-bypass path
// (useRealOAuth: false). Companion to edit.real.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: false,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/article/edit/my-article");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/edit/my-article", {
    method: "POST",
    body: formData,
  });
}

function callAction(entries: Record<string, string>) {
  return action({
    request: makeRequest(entries),
  } as unknown as Parameters<typeof action>[0]);
}

function callLoader(articleUrl = "my-article") {
  return loader({
    request: makeRequest(),
    params: { articleUrl },
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockClear();
});

describe("loader — dev bypass", () => {
  it("returns the dev fixture without touching the agent", async () => {
    const result = await callLoader("my-article");
    const expected = devEditLoader("my-article");
    // createdAt is stamped with a live `new Date().toISOString()` inside
    // devEditLoader — compare everything else exactly and createdAt loosely.
    const { createdAt: _actualCreatedAt, ...actualRest } = result;
    const { createdAt: _expectedCreatedAt, ...expectedRest } = expected;
    expect(actualRest).toEqual(expectedRest);
    expect(result.createdAt).toEqual(expect.any(String));
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action — dev bypass", () => {
  it("validates, then returns ok without touching the agent", async () => {
    await expect(callAction({ title: "", url: "" })).resolves.toEqual({
      ok: false,
      error: "Title is required.",
    });

    await expect(
      callAction({ title: "My Article", url: "my-article" }),
    ).resolves.toEqual({ ok: true, title: "My Article" });
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});
