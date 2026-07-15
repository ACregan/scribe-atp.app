import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader, action } from "./review";
import { requireAtpAgent } from "~/services/auth.server";
import { devReviewLoader } from "~/services/devFixtures.server";

// Characterization tests for the review route's dev-bypass path
// (useRealOAuth: false). Companion to review.real.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAtpAgent: vi.fn(),
  useRealOAuth: false,
}));

const PARAMS = { contributorDid: "did:plc:contributor", rkey: "abc123" };

function makeRequest(entries?: Record<string, string>): Request {
  if (!entries) return new Request("http://localhost/article/review");
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return new Request("http://localhost/article/review", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.mocked(requireAtpAgent).mockClear();
});

describe("loader — dev bypass", () => {
  it("returns the dev fixture without touching the agent", async () => {
    // devReviewLoader() stamps live timestamps internally, so comparing
    // against a second call is flaky by a millisecond (same reasoning as
    // list.devBypass.test.ts) — compare shape instead.
    const fixture = devReviewLoader(PARAMS.contributorDid, PARAMS.rkey);
    const result = await loader({
      request: makeRequest(),
      params: PARAMS,
    } as unknown as Parameters<typeof loader>[0]);

    expect(result.contributorDid).toBe(fixture.contributorDid);
    expect(result.siteSlug).toBe(fixture.siteSlug);
    expect(result.siteTitle).toBe(fixture.siteTitle);
    expect(result.groups).toEqual(fixture.groups);
    expect(result.document.title).toBe(fixture.document.title);
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});

describe("action — dev bypass", () => {
  it("returns ok without touching the agent", async () => {
    await expect(
      action({
        request: makeRequest({ _intent: "approveSubmission" }),
        params: PARAMS,
      } as unknown as Parameters<typeof action>[0]),
    ).resolves.toEqual({ ok: true });
    expect(requireAtpAgent).not.toHaveBeenCalled();
  });
});
