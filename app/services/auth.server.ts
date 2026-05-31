import {
  NodeOAuthClient,
} from "@atproto/oauth-client-node";
import { Agent } from "@atproto/api";
import { createCookieSessionStorage, redirect } from "react-router";
import { oauthStateStore, oauthSessionStore } from "~/services/db.server";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const isProduction = process.env.NODE_ENV === "production";
// Set DEV_USE_REAL_OAUTH=true in .env when you need to test real AT Protocol
// calls locally. Requires PUBLIC_URL to be set to a tunnel URL (e.g. cloudflared).
export const useRealOAuth =
  isProduction || process.env.DEV_USE_REAL_OAUTH === "true";

export const PUBLIC_URL_DEFAULT = "https://scribe-atp.app";
const publicUrl = process.env.PUBLIC_URL ?? PUBLIC_URL_DEFAULT;
const devPort = process.env.DEV_PORT ?? "5173";

const clientId = useRealOAuth
  ? `${publicUrl}/client-metadata.json`
  : "http://localhost";

export const OAUTH_SCOPE = [
  "atproto",
  "repo:app.scribe.article?action=create",
  "repo:app.scribe.article?action=update",
  "repo:app.scribe.article?action=delete",
  "repo:app.scribe.site?action=create",
  "repo:app.scribe.site?action=update",
  "repo:app.scribe.site?action=delete",
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
  const next = current.then(() => fn()).finally(() => {
    if (global.__oauthLocks!.get(key) === next) global.__oauthLocks!.delete(key);
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
  request: Request
): Promise<{ did: string; handle: string }> {
  const { did, handle, isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated || !did) throw redirect("/login");
  return { did, handle: handle ?? did };
}

export async function createAuthSession(
  request: Request,
  { did, handle }: { did: string; handle: string },
  redirectTo: string
) {
  const session = await getSession(request.headers.get("Cookie"));
  session.set("did", did);
  session.set("handle", handle);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function getAtpAgent(did: string) {
  try {
    const session = await oauthClient.restore(did);
    return new Agent(session);
  } catch (err) {
    // OAuth session lost (process restart, stale in-memory store, etc.)
    // Throw a redirect so the user re-authenticates rather than seeing an error.
    console.error("ATP session lost for", did, "— redirecting to login:", err);
    throw redirect("/login");
  }
}

export async function destroyAuthSession(
  request: Request,
  redirectTo: string
) {
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
