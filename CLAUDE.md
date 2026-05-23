# Scribe ATP

An AT Protocol-driven content management system. Authors write and store articles in their own Bluesky PDS (Personal Data Server); the AT Protocol repository is the database.

## Stack

- **React Router v7** (framework mode, SSR enabled)
- **Vite** (dev server, default port 5173)
- **TypeScript** (strict mode)
- **@atproto/oauth-client-node** — Bluesky OAuth PKCE flow
- **@atproto/api** — AT Protocol XRPC calls (Agent)
- **better-sqlite3** — SQLite store for OAuth state/sessions (`data/oauth.db`)
- **lexical / @lexical/react** (+ @lexical/rich-text, @lexical/history, @lexical/list, @lexical/html) — WYSIWYG rich text editor (article content stored as HTML)
- **@dnd-kit/core**, **@dnd-kit/sortable**, **@dnd-kit/utilities** — drag-and-drop for article/group reordering on `/article/list`
- **classnames** — CSS class composition utility
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
/sites                       sites       — manage sites (in development)
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

Key exports from `auth.server.ts`:

| Function | Purpose |
|---|---|
| `getAuthSession(request)` | Reads session cookie — returns `{ did, handle, isAuthenticated }` (all optional) |
| `requireAuth(request)` | Like `getAuthSession` but throws a redirect to `/login` if not authenticated — returns `{ did, handle }` non-optional |
| `getAtpAgent(did)` | Restores OAuth session from SQLite and returns an `Agent` — throws redirect to `/login` on failure |
| `createAuthSession(request, { did, handle }, redirectTo)` | Writes session cookie and redirects |
| `destroyAuthSession(request, redirectTo)` | Clears session cookie and redirects — used by the `/logout` route |
| `useRealOAuth` | Boolean constant — `true` in production or when `DEV_USE_REAL_OAUTH=true` |

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

The `NodeOAuthClient` `stateStore` and `sessionStore` are backed by SQLite via `app/services/db.server.ts`. The database file lives at `data/oauth.db` (gitignored). It is created automatically on first run.

- **`oauth_session`** — long-lived OAuth tokens, keyed by DID. Survives server restarts.
- **`oauth_state`** — short-lived PKCE state, keyed by random state string. Rows older than 10 minutes are pruned on startup via `pruneStaleState()` (left behind when a user starts auth but never completes it).

The `data/` directory is created automatically on first run (`fs.mkdirSync` with `recursive: true`) — no manual setup needed on deploy.

`getAtpAgent(did)` catches any session-restore failure and throws a redirect to `/login` rather than surfacing an error page.

For production with multiple instances, replace the SQLite store with a shared store (Turso/libSQL, Redis, etc.).

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

### Collections

**`app.scribe.article`** — article content, rkey = url slug:
```ts
{
  $type: "app.scribe.article",
  title: string,
  content: string,       // HTML, produced by the RichTextEditor
  url: string,           // same as rkey
  splashImageUrl?: string,
  createdAt: string,     // ISO 8601
}
```

**`app.scribe.group`** — organisational groups, rkey = slug derived from title:
```ts
{
  $type: "app.scribe.group",
  title: string,
  children: [],          // unused — structure is managed by the manifest
  createdAt: string,     // ISO 8601
}
```

Groups and articles are organised via **`app.scribe.manifest`** — rkey `"main"`, a single record per user. The `/article/list` route reads and writes this to persist drag-and-drop ordering. Structure:
```ts
{
  $type: "app.scribe.manifest",
  items: ManifestItem[],   // ordered flat list
  updatedAt: string,       // ISO 8601
}

// ManifestItem union:
{ type: "article"; slug: string }                                     // root-level article
{ type: "group"; slug: string; title: string; children: { type: "article"; slug: string }[] }
```

The `/article/list` route maintains a **ROOT virtual group** (`id: "g:root"`) in client state that holds all ungrouped articles. ROOT is never draggable and is never written to the manifest — its children serialise as root-level `{ type: "article" }` items. Named groups serialise as `{ type: "group" }` items. Articles not present in the manifest are appended to ROOT; groups not present are appended after the manifest groups.

The list route action handles four intents via the `_intent` form field: `createGroup`, `deleteGroup`, `saveManifest`, `deleteArticle`.

### OAuth scopes

```
atproto
repo:app.scribe.article?action=create
repo:app.scribe.article?action=update
repo:app.scribe.article?action=delete
repo:app.scribe.group?action=create
repo:app.scribe.group?action=update
repo:app.scribe.group?action=delete
repo:app.scribe.manifest?action=create
repo:app.scribe.manifest?action=update
```

Declared in three places — `app/services/auth.server.ts` (clientMetadata), `app/routes/login/login.tsx` (authorize call), and `public/client-metadata.json`. Any new collection needs its own scopes added in all three places. **Users must re-authenticate after a scope change** — existing sessions do not gain new scopes.

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

const agent = await getAtpAgent(did); // restores OAuth session from SQLite; throws redirect("/login") if missing
await agent.com.atproto.repo.createRecord({ ... });
await agent.com.atproto.repo.putRecord({ ... });
await agent.com.atproto.repo.deleteRecord({ ... });
await agent.com.atproto.repo.listRecords({ ... });
await agent.com.atproto.repo.getRecord({ ... });
```

`getAtpAgent` automatically redirects to `/login` if the session is missing — callers do not need to handle this error.

## Components

Reusable UI components live in `app/components/`. Each has a co-located CSS module.

| Component | Path | Props |
|---|---|---|
| `Input` | `app/components/Input/Input.tsx` | All `<input>` HTML attrs + `label?: string`, `error?: string` |
| `Button` | `app/components/Button/Button.tsx` | All `<button>` HTML attrs + `variant?: "primary" \| "secondary" \| "danger"` (default `"primary"`) |
| `RichTextEditor` | `app/components/RichTextEditor/RichTextEditor.tsx` | `name: string`, `label?: string`, `defaultValue?: string` — drop-in for `<textarea>`, outputs HTML into a hidden field on form submit. Client-only (falls back to plain textarea during SSR). |
| `Modal` | `app/components/Modal/Modal.tsx` | `isOpen: boolean`, `onClose: () => void`, `title: string`, `footer?: ReactNode`, `children: ReactNode` — renders via `createPortal` into `document.body`. Closes on Escape key. |
| `useModal` | `app/components/Modal/useModal.ts` | Hook returning `{ isOpen, open, close }` — use alongside `Modal` to manage open state. |
| `PageContainer` | `app/components/PageContainer/PageContainer.tsx` | Page-level layout wrapper. Props: `children`, `title?: ReactNode` (string renders as `<h1>`), `topButtons?: ReactNode`, `bottomButtons?: ReactNode`. Also exports `PageSection` (a simple content-dividing wrapper, `children` only) from the same file. |
| `ArticleList` | `app/components/ArticleList/ArticleList.tsx` | `<ul>` wrapper for a list of `ArticleItem` components. Props: `children`. |
| `ArticleItem` | `app/components/ArticleItem/ArticleItem.tsx` | Individual article row. Props: `id`, `uri`, `title`, `createdAt`, `cid`. `id` is the dnd-kit sortable id (`a:{slug}`). Includes View/Edit/Delete buttons and a built-in delete confirmation `Modal`. Also exports `ArticleItemPreview` (hook-free version for use inside `DragOverlay`). |
| `GroupList` | `app/components/GroupList/GroupList.tsx` | `<ul>` wrapper for a list of `GroupItem` components. Props: `children`. |
| `GroupItem` | `app/components/GroupItem/GroupItem.tsx` | Individual group row. Props: `id`, `uri`, `cid`, `title`, `slug`, `articleChildren: TreeArticle[]`, `isRoot?: boolean`. Also exports `GroupItemPreview` (hook-free, for `DragOverlay`) and the `TreeArticle` interface. `id` is the dnd-kit sortable id (`g:{slug}`). When `isRoot` is true, renders a simplified "Orphaned Articles" container with no drag handle or delete button. Named groups include a Delete Group button (disabled when the group has children) with a confirmation modal. |
| `AsideMenu` | `app/components/AsideMenu/AsideMenu.tsx` | Navigation sidebar — home, article list, create article, logout links. Rendered by the core layout. |
| `SvgIcon` | `app/components/SvgIcon/SvgIcon.tsx` | Renders SVG icons. Props: `name: SvgImageList` (enum), `className?`, `stroke?`, `strokeWidth?`, `fill?`, `background?`, `text?`. |
| `Tooltip` / `TooltipBubble` | `app/components/Tooltip/Tooltip.tsx` | CSS-anchor-based tooltip. `Tooltip` props: `children`, `anchorName`, `anchorContent`, `anchorPosition`, `zIndex?`. |

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
