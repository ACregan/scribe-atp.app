# Scribe ATP

An AT Protocol-driven content management system. Authors write and store articles in their own Bluesky PDS (Personal Data Server); the AT Protocol repository is the database.

## Stack

- **React Router v7** (framework mode, SSR enabled)
- **Vite** (dev server, default port 5173)
- **TypeScript** (strict mode)
- **@atproto/oauth-client-node** — Bluesky OAuth PKCE flow
- **@atproto/api** — AT Protocol XRPC calls (Agent)
- Production server: `react-router-serve` on port 3008

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Signs the `__session` cookie — must be 32+ random chars |
| `PUBLIC_URL` | Prod | Base URL e.g. `https://scribe-atp.app` — drives `client_id` and `redirect_uri` |
| `DEV_USE_REAL_OAUTH` | Optional | Set to `"true"` to use real Bluesky OAuth in dev (requires tunnel, see below) |
| `DEV_PORT` | Optional | Dev server port if not 5173 |

The app will throw on startup if `SESSION_SECRET` is missing.

## Routes

```
/                            home        — auth status display
/login                       login       — Bluesky OAuth entry point (or dev bypass)
/logout                      logout      — destroys session cookie, redirects to /login
/auth/callback               callback    — OAuth redirect handler, sets session cookie
/article/create              create      — write a new article to the PDS
/article/list                list        — list all articles from the PDS
/article/view/:articleUrl    view        — read-only display of a single article
/article/edit/:articleUrl    edit        — edit an existing article (articleUrl = url slug)
```

All routes sit under a shared layout at `app/layout/core/core.tsx`. The core layout fetches the authenticated user's Bluesky profile (displayName, avatar) server-side and renders it in the header.

Article routes (`/article/*`) are additionally wrapped by a protected layout at `app/layout/protected/protected.tsx` which redirects unauthenticated requests to `/login` before any route loader runs.

Route types are auto-generated — run `npx react-router typegen` after adding a route to `routes.ts`, or they will be generated on the next `dev`/`build`.

## Auth architecture

All auth logic lives in **`app/services/auth.server.ts`** (server-only, never imported client-side).

### Bluesky OAuth flow (production / `DEV_USE_REAL_OAUTH=true`)

1. User submits their handle on `/login`
2. `oauthClient.authorize(handle)` sends a PAR request to the user's PDS and returns a redirect URL
3. Browser is redirected to the Bluesky authorisation page
4. On approval, Bluesky redirects to `/auth/callback?code=...&state=...`
5. `oauthClient.callback(params)` exchanges the code for a session
6. The user's DID is resolved to a handle via `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile`
7. DID + handle are stored in a signed `__session` cookie; browser is redirected to `/`

### Session cookie

`createCookieSessionStorage` from `react-router`. Cookie name `__session`, `httpOnly`, `sameSite: lax`, HTTPS-only in production.

Stored fields: `did` (string), `handle` (string).

Use `getAuthSession(request)` in any loader/action to read auth state. Use `requireAuth(request)` in loaders/actions that require authentication — it throws a redirect to `/login` if the session is missing, and returns `{ did, handle }` (non-optional) on success.

### Dev bypass (default in development)

When `NODE_ENV !== "production"` and `DEV_USE_REAL_OAUTH` is not set, the login action **skips OAuth entirely** — it sets the session directly from the submitted handle with a synthetic DID of `did:dev:{handle}`. This lets UI development proceed without a tunnel or real Bluesky account.

The `useRealOAuth` boolean is exported from `auth.server.ts` and checked in every route that touches the PDS.

In dev-bypass mode, AT Protocol calls are mocked (loaders return empty/placeholder data, actions return mock responses without hitting the PDS).

### Real OAuth in development

Bluesky's auth server must be able to fetch `client-metadata.json` from the `client_id` URL — it cannot reach `localhost`. Use a tunnel:

```bash
npx cloudflared tunnel --url http://localhost:5173
# Note the generated HTTPS URL e.g. https://abc123.trycloudflare.com
```

Then in `.env`:
```
DEV_USE_REAL_OAUTH="true"
PUBLIC_URL="https://abc123.trycloudflare.com"
```

Access the app via the tunnel URL. The tunnel URL changes on every restart.

### OAuth client state / session stores

The `NodeOAuthClient` requires `stateStore` and `sessionStore`. These are in-memory `Map`s stored on `global` so they survive Vite HMR reloads. They reset on process restart — any in-flight OAuth flows will fail after a restart and users will need to log in again.

For production with multiple instances, replace these with a shared store (Redis, etc.).

## AT Protocol patterns

### Collection

All articles are stored under the collection `app.scribe.article`.

### rkey = url slug

The article's `url` field (a lowercase dash-separated slug e.g. `my-article-title`) is used directly as the AT Protocol record key (`rkey`). This means:

- The AT URI is `at://did/app.scribe.article/my-article-title`
- The edit route `/article/edit/my-article-title` maps directly to the rkey
- No secondary lookup is needed

**Slug format:** `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` — validated server-side on create and edit.

### Renaming a slug

AT Protocol records cannot be moved to a different rkey in-place. Renaming the slug in the edit form triggers:
1. `createRecord` at the new rkey with updated content
2. `deleteRecord` on the old rkey (best-effort — logged but not fatal if it fails)

This breaks any existing AT URIs pointing to the old rkey.

### Record schema

```ts
{
  $type: "app.scribe.article",
  title: string,
  content: string,
  url: string,          // same as rkey
  splashImageUrl?: string,
  createdAt: string,    // ISO 8601
}
```

### OAuth scopes

```
atproto
repo:app.scribe.article?action=create
repo:app.scribe.article?action=update
repo:app.scribe.article?action=delete
```

Declared in both `app/services/auth.server.ts` (clientMetadata) and `public/client-metadata.json`. Any new collection added to the app needs its own scopes added in both places. **Users must re-authenticate after a scope change** — existing sessions do not gain new scopes.

### Public read access

AT Protocol repositories are **publicly readable without authentication**. Any consumer can call:

```
GET https://{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection=app.scribe.article
GET https://{pds}/xrpc/com.atproto.repo.getRecord?repo={did}&collection=app.scribe.article&rkey={slug}
```

This means a separate read-only frontend (public blog, etc.) can fetch and display articles with no OAuth token.

### Making authenticated AT Protocol calls

```ts
import { getAtpAgent } from "~/services/auth.server";

const agent = await getAtpAgent(did); // restores OAuth session from in-memory store
await agent.com.atproto.repo.createRecord({ ... });
await agent.com.atproto.repo.putRecord({ ... });
await agent.com.atproto.repo.deleteRecord({ ... });
await agent.com.atproto.repo.listRecords({ ... });
await agent.com.atproto.repo.getRecord({ ... });
```

`getAtpAgent` will throw if the session is not found (e.g. after a server restart). Handle this by catching and redirecting to `/login`.

## Components

Reusable UI components live in `app/components/`. Each has a co-located CSS module.

| Component | Path | Props |
|---|---|---|
| `Input` | `app/components/Input/Input.tsx` | All `<input>` HTML attrs + `label?: string`, `error?: string` |
| `Button` | `app/components/Button/Button.tsx` | All `<button>` HTML attrs + `variant?: "primary" \| "secondary" \| "danger"` (default `"primary"`) |

## Client metadata (production)

`public/client-metadata.json` is served as a static file at `/client-metadata.json`. Bluesky fetches this URL when `NODE_ENV=production` to verify the OAuth client. The `client_id` in `auth.server.ts` points to this file. Keep the two in sync.

## Key commands

```bash
npm run dev          # start dev server (port 5173)
npm run build        # production build
npm run start        # serve production build (port 3008)
npm run typecheck    # react-router typegen + tsc
npx react-router typegen  # regenerate route types after adding routes
```
