import {
  NodeOAuthClient,
  type NodeSavedState,
  type NodeSavedSession,
} from "@atproto/oauth-client-node";
import { Agent } from "@atproto/api";
import { createCookieSessionStorage, redirect } from "react-router";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const isProduction = process.env.NODE_ENV === "production";
// Set DEV_USE_REAL_OAUTH=true in .env when you need to test real AT Protocol
// calls locally. Requires PUBLIC_URL to be set to a tunnel URL (e.g. cloudflared).
export const useRealOAuth =
  isProduction || process.env.DEV_USE_REAL_OAUTH === "true";

const publicUrl = process.env.PUBLIC_URL ?? "https://scribe-atp.app";
const devPort = process.env.DEV_PORT ?? "5173";

const clientId = useRealOAuth
  ? `${publicUrl}/client-metadata.json`
  : "http://localhost";

const redirectUri = useRealOAuth
  ? `${publicUrl}/auth/callback`
  : `http://127.0.0.1:${devPort}/auth/callback`;

// Persist stores across HMR reloads in dev so in-flight OAuth flows survive
declare global {
  // eslint-disable-next-line no-var
  var __oauthStateStore: Map<string, NodeSavedState> | undefined;
  // eslint-disable-next-line no-var
  var __oauthSessionStore: Map<string, NodeSavedSession> | undefined;
}
global.__oauthStateStore ??= new Map();
global.__oauthSessionStore ??= new Map();

export const oauthClient = new NodeOAuthClient({
  clientMetadata: {
    client_name: "Scribe ATP",
    client_id: clientId,
    client_uri: isProduction ? publicUrl : "http://localhost",
    redirect_uris: [redirectUri],
    scope: "atproto repo:app.scribe.article?action=create repo:app.scribe.article?action=update repo:app.scribe.article?action=delete",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    dpop_bound_access_tokens: true,
  },
  stateStore: {
    get: (key) => Promise.resolve(global.__oauthStateStore!.get(key)),
    set: (key, val) => {
      global.__oauthStateStore!.set(key, val);
      return Promise.resolve();
    },
    del: (key) => {
      global.__oauthStateStore!.delete(key);
      return Promise.resolve();
    },
  },
  sessionStore: {
    get: (key) => Promise.resolve(global.__oauthSessionStore!.get(key)),
    set: (key, val) => {
      global.__oauthSessionStore!.set(key, val);
      return Promise.resolve();
    },
    del: (key) => {
      global.__oauthSessionStore!.delete(key);
      return Promise.resolve();
    },
  },
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
  const session = await oauthClient.restore(did);
  return new Agent(session);
}

export async function destroyAuthSession(
  request: Request,
  redirectTo: string
) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await destroySession(session) },
  });
}
