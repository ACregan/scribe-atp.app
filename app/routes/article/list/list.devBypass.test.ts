import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader, action } from "./list";
import { requireAtpAgent } from "~/services/auth.server";
import { devArticleListLoader } from "~/services/devFixtures.server";

// Characterization tests for the article-list route's dev-bypass path
// (useRealOAuth: false). Companion to list.real.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: false,
}));

vi.mock("~/services/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/article/list");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/list", {
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
  return loader({ request: makeRequest() } as unknown as Parameters<
    typeof loader
  >[0]);
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockClear();
});

describe("loader — dev bypass", () => {
  it("returns the dev fixture without touching the agent", async () => {
    // devArticleListLoader() stamps live timestamps internally, so comparing
    // against a second call is flaky by a millisecond; compare shape instead.
    const fixture = devArticleListLoader();
    const result = await callLoader();

    expect(result.authorDid).toBe(fixture.authorDid);
    expect(result.authorHandle).toBe(fixture.authorHandle);
    expect(result.publishedArticles).toHaveLength(
      fixture.publishedArticles.length,
    );
    expect(result.standaloneArticles).toHaveLength(
      fixture.standaloneArticles.length,
    );
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action — dev bypass", () => {
  it("returns ok without touching the agent", async () => {
    await expect(callAction({ rkey: "a", cid: "b" })).resolves.toEqual({
      ok: true,
    });
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});
