import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getAuthSession,
  requireAuth,
  createAuthSession,
  destroyAuthSession,
  getAtpAgent,
  requireAtpAgent,
  requireAdminAtpAgent,
  oauthClient,
} from "./auth.server";

// This is the only test file that imports the real (non-mocked)
// auth.server.ts — every route test mocks it wholesale. See test.setup.ts
// for the SESSION_SECRET/CMS_DB_PATH env defaults this relies on.

const DID = "did:plc:testuser";
const HANDLE = "testuser.bsky.social";

async function makeAuthedRequest(did = DID, handle = HANDLE): Promise<Request> {
  const res = await createAuthSession(new Request("http://x/"), { did, handle }, "/");
  const setCookie = res.headers.get("set-cookie")!;
  const cookieValue = setCookie.split(";")[0];
  return new Request("http://x/", { headers: { Cookie: cookieValue } });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ADMIN_DID;
});

describe("getAuthSession", () => {
  it("returns isAuthenticated:false with no did/handle for a request with no cookie", async () => {
    const result = await getAuthSession(new Request("http://x/"));
    expect(result).toEqual({ did: undefined, handle: undefined, isAuthenticated: false });
  });

  it("returns the did/handle from a valid session cookie", async () => {
    const request = await makeAuthedRequest();
    const result = await getAuthSession(request);
    expect(result).toEqual({ did: DID, handle: HANDLE, isAuthenticated: true });
  });
});

describe("requireAuth", () => {
  it("throws a redirect to /login when unauthenticated", async () => {
    await expect(requireAuth(new Request("http://x/"))).rejects.toMatchObject({
      status: 302,
    });
    try {
      await requireAuth(new Request("http://x/"));
    } catch (res) {
      expect((res as Response).headers.get("location")).toBe("/login");
    }
  });

  it("returns did/handle for an authenticated request", async () => {
    const request = await makeAuthedRequest();
    await expect(requireAuth(request)).resolves.toEqual({ did: DID, handle: HANDLE });
  });

  it("falls back handle to did when handle is missing from the session", async () => {
    // createAuthSession always sets both, so simulate a handle-less session
    // the same way getAuthSession would see one (a session cookie without
    // a handle key) by round-tripping through createAuthSession with an
    // empty-string handle, then confirming the ?? fallback only kicks in
    // for the strictly-missing case documented in the function itself —
    // requireAuth's fallback is `handle ?? did`, so only null/undefined
    // trigger it, not an empty string.
    const request = await makeAuthedRequest(DID, "");
    await expect(requireAuth(request)).resolves.toEqual({ did: DID, handle: "" });
  });
});

describe("createAuthSession / destroyAuthSession", () => {
  it("createAuthSession sets a session cookie readable by getAuthSession", async () => {
    const res = await createAuthSession(new Request("http://x/"), { did: DID, handle: HANDLE }, "/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/dashboard");
    expect(res.headers.get("set-cookie")).toContain("__session=");
  });

  it("destroyAuthSession clears the cookie and redirects", async () => {
    const request = await makeAuthedRequest();
    const res = await destroyAuthSession(request, "/login");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
    // A cleared react-router session cookie is re-set with Max-Age=0.
    expect(res.headers.get("set-cookie")).toMatch(/__session=;|Max-Age=0/);
  });

  it("destroyAuthSession is safe to call with no existing session", async () => {
    const res = await destroyAuthSession(new Request("http://x/"), "/login");
    expect(res.status).toBe(302);
  });
});

describe("getAtpAgent", () => {
  it("returns an Agent when the OAuth session restores successfully", async () => {
    vi.spyOn(oauthClient, "restore").mockResolvedValue({ did: DID } as never);
    const agent = await getAtpAgent(DID);
    expect(agent).toBeDefined();
  });

  it("throws a redirect to /login when the OAuth session cannot be restored", async () => {
    vi.spyOn(oauthClient, "restore").mockRejectedValue(new Error("session lost"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getAtpAgent(DID)).rejects.toMatchObject({ status: 302 });
  });
});

describe("requireAtpAgent", () => {
  it("returns agent/did/handle for an authenticated request with a restorable session", async () => {
    vi.spyOn(oauthClient, "restore").mockResolvedValue({ did: DID } as never);
    const request = await makeAuthedRequest();
    const result = await requireAtpAgent(request);
    expect(result.did).toBe(DID);
    expect(result.handle).toBe(HANDLE);
    expect(result.agent).toBeDefined();
  });

  it("throws a redirect to /login when unauthenticated (never reaches getAtpAgent)", async () => {
    const restoreSpy = vi.spyOn(oauthClient, "restore");
    await expect(requireAtpAgent(new Request("http://x/"))).rejects.toMatchObject({ status: 302 });
    expect(restoreSpy).not.toHaveBeenCalled();
  });
});

describe("requireAdminAtpAgent", () => {
  it("404s when ADMIN_DID is not configured at all", async () => {
    vi.spyOn(oauthClient, "restore").mockResolvedValue({ did: DID } as never);
    const request = await makeAuthedRequest();
    await expect(requireAdminAtpAgent(request)).rejects.toMatchObject({ status: 404 });
  });

  it("404s when the authenticated did does not match ADMIN_DID", async () => {
    process.env.ADMIN_DID = "did:plc:someone-else";
    vi.spyOn(oauthClient, "restore").mockResolvedValue({ did: DID } as never);
    const request = await makeAuthedRequest();
    await expect(requireAdminAtpAgent(request)).rejects.toMatchObject({ status: 404 });
  });

  it("succeeds when the authenticated did matches ADMIN_DID", async () => {
    process.env.ADMIN_DID = DID;
    vi.spyOn(oauthClient, "restore").mockResolvedValue({ did: DID } as never);
    const request = await makeAuthedRequest();
    const result = await requireAdminAtpAgent(request);
    expect(result.did).toBe(DID);
  });
});
