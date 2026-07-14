import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAdminAtpAgent } from "~/services/auth.server";
import { middleware } from "./admin";

vi.mock("~/services/auth.server", () => ({
  requireAdminAtpAgent: vi.fn(),
}));

const adminMiddleware = middleware[0];

function makeArgs(method: "GET" | "POST") {
  return {
    request: new Request("http://localhost/devtools/repair-loose-documents", {
      method,
    }),
    params: {},
    context: {} as never,
    url: new URL("http://localhost/devtools/repair-loose-documents"),
    pattern: "/devtools/repair-loose-documents",
  };
}

beforeEach(() => {
  vi.mocked(requireAdminAtpAgent).mockReset();
});

describe("admin layout middleware", () => {
  it("calls requireAdminAtpAgent for a loader-shaped (GET) request", async () => {
    vi.mocked(requireAdminAtpAgent).mockResolvedValue({
      agent: {} as never,
      did: "did:plc:admin",
      handle: "admin.bsky.social",
    });

    await expect(
      adminMiddleware(makeArgs("GET"), vi.fn()),
    ).resolves.not.toThrow();
    expect(requireAdminAtpAgent).toHaveBeenCalledTimes(1);
  });

  it("bug fix: also calls requireAdminAtpAgent for an action-shaped (POST) request — a plain ancestor loader would not have covered this", async () => {
    // This is the whole point of using middleware instead of a plain
    // ancestor route loader: per React Router's own docs, an ancestor
    // loader only re-runs *after* an action, for revalidation, never
    // before it — so it would never actually gate a POST to a devtools
    // route's action. Middleware runs for both.
    vi.mocked(requireAdminAtpAgent).mockResolvedValue({
      agent: {} as never,
      did: "did:plc:admin",
      handle: "admin.bsky.social",
    });

    await expect(
      adminMiddleware(makeArgs("POST"), vi.fn()),
    ).resolves.not.toThrow();
    expect(requireAdminAtpAgent).toHaveBeenCalledTimes(1);
  });

  it("propagates the 404 requireAdminAtpAgent throws for a non-admin caller", async () => {
    vi.mocked(requireAdminAtpAgent).mockRejectedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = adminMiddleware(makeArgs("GET"), vi.fn());
    await expect(result).rejects.toMatchObject({ status: 404 });
  });
});
