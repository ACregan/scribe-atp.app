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
// Exported for the Contributors invite DM (contributorRoster.server.ts),
// which needs the app's own root URL for the invite link — same value,
// single source of truth rather than re-reading process.env a second time.
export const publicUrl = process.env.PUBLIC_URL ?? PUBLIC_URL_DEFAULT;
const devPort = process.env.DEV_PORT ?? "5173";

const clientId = useRealOAuth
  ? `${publicUrl}/client-metadata.json`
  : "http://localhost";

// ADR 0019/0025/0026 — the chat.bsky RPC scopes this app needs. Bluesky's
// chat lexicons are service-proxied to did:web:api.bsky.chat#bsky_chat (per
// atproto.com/specs/permission's rpc: scope syntax — "rpc:<lxm>?aud=<did>"),
// not covered by any repo:/blob: scope above. getConvoForMembers/sendMessage
// were added in Phase 1 (ADR 0019) for the Contributor invite DM. getMessages
// is Phase 5's own addition (ADR 0025, Site Chat) — reading a conversation is
// a genuinely new capability the invite DM never needed. createGroup/
// addMembers/removeMembers (chat.bsky.group) and getConvo/acceptConvo
// (chat.bsky.convo) are ADR 0026's group-conversation redesign — found live
// 2026-07-17: createGroup failed with "Missing required scope" because these
// five were never added to this list when that redesign was implemented, so
// group creation/sync silently failed for every session authorized before
// this fix. Every scope addition here triggers a fresh re-authentication
// event for existing users, contrary to an earlier assumption in
// PLANNING.md.
const CHAT_AUD = "did:web:api.bsky.chat#bsky_chat";

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
  `rpc:chat.bsky.convo.getConvoForMembers?aud=${CHAT_AUD}`,
  `rpc:chat.bsky.convo.sendMessage?aud=${CHAT_AUD}`,
  `rpc:chat.bsky.convo.getMessages?aud=${CHAT_AUD}`,
  `rpc:chat.bsky.convo.getConvo?aud=${CHAT_AUD}`,
  `rpc:chat.bsky.convo.acceptConvo?aud=${CHAT_AUD}`,
  `rpc:chat.bsky.group.createGroup?aud=${CHAT_AUD}`,
  `rpc:chat.bsky.group.addMembers?aud=${CHAT_AUD}`,
  `rpc:chat.bsky.group.removeMembers?aud=${CHAT_AUD}`,
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

// requireAuth/getAtpAgent/requireAtpAgent throw a redirect Response on auth
// failure — getAtpAgent's redirect in particular carries a Set-Cookie header
// that clears a stale session (see its comment above). A route's own
// try/catch, written to turn PDS write failures into a friendly error
// message, must not treat that Response as a generic error or the redirect
// (and its cookie-clearing header) gets silently swallowed, reintroducing a
// login redirect loop. Call this first in any catch block that wraps a call
// to one of those three functions.
export function rethrowIfRedirect(err: unknown): void {
  if (err instanceof Response) throw err;
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
