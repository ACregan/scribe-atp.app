import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { Agent } from "@atproto/api";
import { createCookieSessionStorage, redirect } from "react-router";
import { oauthStateStore, oauthSessionStore } from "~/services/db.server";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

// E2E=true is intentional in CI (Playwright runs against a production build).
// Reject it on a real production server where CI is not set.
if (
  process.env.NODE_ENV === "production" &&
  process.env.E2E === "true" &&
  process.env.CI !== "true"
) {
  throw new Error("E2E mode cannot be enabled in production");
}

const isProduction = process.env.NODE_ENV === "production";
// Set DEV_USE_REAL_OAUTH=true in .env when you need to test real AT Protocol
// calls locally. Requires PUBLIC_URL to be set to a tunnel URL (e.g. cloudflared).
// E2E=true forces dev-bypass even when running the production build, so the
// Playwright suite can exercise the UI without a live PDS.
export const useRealOAuth =
  (isProduction && process.env.E2E !== "true") ||
  process.env.DEV_USE_REAL_OAUTH === "true";

export const PUBLIC_URL_DEFAULT = "https://scribe-atp.app";
const publicUrl = process.env.PUBLIC_URL ?? PUBLIC_URL_DEFAULT;
const devPort = process.env.DEV_PORT ?? "5173";

const clientId = useRealOAuth
  ? `${publicUrl}/client-metadata.json`
  : "http://localhost";

export const OAUTH_SCOPE = [
  "atproto",
  "repo:site.standard.document?action=create",
  "repo:site.standard.document?action=update",
  "repo:site.standard.document?action=delete",
  "repo:site.standard.publication?action=create",
  "repo:site.standard.publication?action=update",
  "repo:site.standard.publication?action=delete",
  "repo:site.standard.graph.recommend?action=delete",
  "repo:app.bsky.feed.post?action=create",
  "blob:image/webp",
].join(" ");

const redirectUri = useRealOAuth
  ? `${publicUrl}/auth/callback`
  : `http://127.0.0.1:${devPort}/auth/callback`;

declare global {
  // eslint-disable-next-line no-var
  var __oauthLocks: Map<string, Promise<unknown>> | undefined;
}
global.__oauthLocks ??= new Map();

function requestLock<T>(key: string, fn: () => T | PromiseLike<T>): Promise<T> {
  const current = global.__oauthLocks!.get(key) ?? Promise.resolve();
  const next = current
    .then(() => fn())
    .finally(() => {
      if (global.__oauthLocks!.get(key) === next)
        global.__oauthLocks!.delete(key);
    });
  global.__oauthLocks!.set(key, next);
  return next;
}

// Stable OAuth metadata fields — identical in client-metadata.ts and here.
// Exported so client-metadata.ts can spread them rather than duplicating.
export const OAUTH_METADATA_STATIC = {
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  application_type: "web",
  dpop_bound_access_tokens: true,
  policy_uri: "https://docs.scribe-atp.app/privacy",
};

export const oauthClient = new NodeOAuthClient({
  requestLock,
  clientMetadata: {
    client_name: "Scribe ATP",
    client_id: clientId,
    client_uri: isProduction ? publicUrl : "http://localhost",
    redirect_uris: [redirectUri],
    scope: OAUTH_SCOPE,
    // Keep in sync with OAUTH_METADATA_STATIC below
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    dpop_bound_access_tokens: true,
  },
  stateStore: oauthStateStore,
  sessionStore: oauthSessionStore,
});

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: {
      name: "__session",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secrets: [process.env.SESSION_SECRET],
      secure: isProduction,
    },
  });

export async function getAuthSession(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  const did = session.get("did") as string | undefined;
  const handle = session.get("handle") as string | undefined;
  return { did, handle, isAuthenticated: Boolean(did) };
}

export async function requireAuth(
  request: Request,
): Promise<{ did: string; handle: string }> {
  const { did, handle, isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated || !did) throw redirect("/login");
  return { did, handle: handle ?? did };
}

export async function createAuthSession(
  request: Request,
  { did, handle }: { did: string; handle: string },
  redirectTo: string,
) {
  const session = await getSession(request.headers.get("Cookie"));
  session.set("did", did);
  session.set("handle", handle);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function getAtpAgent(did: string, request: Request) {
  try {
    const session = await oauthClient.restore(did);
    return new Agent(session);
  } catch (err) {
    // OAuth session lost (process restart, stale in-memory store, revoked
    // authorization, expired refresh token, etc.) — the __session cookie
    // itself is still validly signed (getAuthSession/requireAuth pass), so
    // without clearing it here every subsequent request, including the
    // /login redirect target below, re-reads the same broken did and hits
    // this exact catch block again. Since core.tsx's layout loader calls
    // getAtpAgent unconditionally whenever a session cookie parses with a
    // did, and /login sits under that same layout, an uncleared cookie
    // turns this into a permanent redirect-to-self loop for the affected
    // browser ("scribe-cms.app redirected you too many times") rather than
    // a one-time bounce to the login page. Destroying the session (both the
    // cookie and the SQLite oauth_session row, mirroring destroyAuthSession)
    // guarantees the /login request that follows sees isAuthenticated:
    // false instead of retrying the same failing restore.
    console.error("ATP session lost for", did, "— redirecting to login:", err);
    oauthSessionStore.del(did);
    const session = await getSession(request.headers.get("Cookie"));
    throw redirect("/login", {
      headers: { "Set-Cookie": await destroySession(session) },
    });
  }
}

export async function requireAtpAgent(
  request: Request,
): Promise<{ agent: Agent; did: string; handle: string }> {
  const { did, handle } = await requireAuth(request);
  const agent = await getAtpAgent(did, request);
  return { agent, did, handle };
}

// Scribe CMS has open registration (any Bluesky account can log in — see
// ADR 0010), so requireAtpAgent alone is not enough to gate the /devtools
// repair tools: any authenticated user could reach them and run repair
// logic against their own PDS repo. Restricts access to a single DID set
// via ADMIN_DID, 404ing (not 403 — an admin route shouldn't confirm its own
// existence to other users) for everyone else.
export async function requireAdminAtpAgent(
  request: Request,
): Promise<{ agent: Agent; did: string; handle: string }> {
  const result = await requireAtpAgent(request);
  const adminDid = process.env.ADMIN_DID;
  if (!adminDid || result.did !== adminDid) {
    throw new Response("Not Found", { status: 404 });
  }
  return result;
}

export async function destroyAuthSession(request: Request, redirectTo: string) {
  const session = await getSession(request.headers.get("Cookie"));
  const did = session.get("did") as string | undefined;

  // Clear the OAuth session from SQLite so the next login goes through a full
  // new authorization and gets a fresh access token with current scopes.
  if (did) {
    oauthSessionStore.del(did);
  }

  return redirect(redirectTo, {
    headers: { "Set-Cookie": await destroySession(session) },
  });
}
