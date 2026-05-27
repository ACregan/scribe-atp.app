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
/                              home       — auth status display
/login                         login      — Bluesky OAuth entry point (or dev bypass)
/logout                        logout     — destroys session cookie, redirects to /login
/auth/callback                 callback   — OAuth redirect handler, sets session cookie
/article/create                create     — write a new article to the PDS; multi-select assigns to sites
/article/list                  list       — site picker; links into site-list
/article/list/:siteSlug        site-list  — site-scoped article/group management; reads/writes app.scribe.site
/article/view/:articleUrl      view       — read-only display of a single article
/article/edit/:articleUrl      edit       — edit an existing article; multi-select manages site assignment
/sites                         sites      — list, create and delete app.scribe.site records
/site/:siteName/configure      configure  — edit site metadata (title, description, images, url, urlPrefix) — PLANNED
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

**`app.scribe.site`** — a managed website, rkey = URL-derived slug (e.g. `norobots-blog`):
```ts
{
  $type: "app.scribe.site",
  url: string,            // e.g. "norobots.blog" — domain name
  title: string,
  urlPrefix: string,      // e.g. "blog" — path prefix; composed URL = url + "/" + urlPrefix
  description?: string,   // PLANNED — human-readable description of the site
  splashImageUrl?: string, // PLANNED — hero/banner image
  logoImageUrl?: string,  // PLANNED — site logo
  contributors: string[], // DIDs of contributors
  groups: Array<{         // named groups (order is significant)
    slug: string,
    title: string,
    articles: ArticleRef[],
  }>,
  articles: ArticleRef[], // top-level ungrouped articles
  createdAt: string,
  updatedAt: string,
}

// ArticleRef — cached snapshot stored inside the site record:
{
  uri: string,           // full AT URI e.g. at://did/app.scribe.article/slug
  title: string,
  splashImageUrl: string | null,
  createdAt: string,
}
```

Key design decisions for `app.scribe.site`:
- `ownerId` is omitted — the owner is whoever's PDS holds the record (their DID is the repo DID)
- Article refs are objects (not bare AT URIs) with cached metadata to avoid N+1 fetches
- `cid` is deliberately excluded from article refs — fetch live at deletion to avoid stale `swapRecord` failures
- Groups and article order within groups are authoritative — the site record is the manifest
- `updatedAt` is useful for cache invalidation by public readers
- Field naming: `url` and `urlPrefix` are candidates for renaming to `domainName` and `articlesPath` — this is a breaking schema change requiring a nuke + re-add of existing site records; defer until decided

The planned `/site/:siteName/configure` route will allow editing site metadata (`title`, `description`, `splashImageUrl`, `logoImageUrl`, `url`, `urlPrefix`) via a `putRecord` on the existing rkey — no rename complexity since the rkey is derived from the original URL and stays fixed.

The `/article/list/:siteSlug` route is the site-scoped management view. It reads the site record, builds a DnD tree, and writes the updated site record back. Actions: `createGroup`, `deleteGroup`, `saveSite`, `removeArticle`. **Remove article only removes it from the site record — it does not delete the PDS article record.**

### OAuth scopes

```
atproto
repo:app.scribe.article?action=create
repo:app.scribe.article?action=update
repo:app.scribe.article?action=delete
repo:app.scribe.site?action=create
repo:app.scribe.site?action=update
repo:app.scribe.site?action=delete
```

The scope list has a single source of truth: `OAUTH_SCOPE` exported from `app/services/auth.server.ts`. It is consumed in three places — `clientMetadata.scope` (same file), `app/routes/client-metadata.ts`, and `app/routes/login/login.tsx` (passed to `oauthClient.authorize()`). **To add a new scope, update `OAUTH_SCOPE` only** — the other two pick it up automatically.

**Users must re-authenticate after a scope change** — existing sessions do not gain new scopes. To revoke an existing authorization: go to **https://bsky.social/account** → find the app entry → revoke.

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
| `ArticleItem` | `app/components/ArticleItem/ArticleItem.tsx` | Individual article row. Props: `id`, `uri`, `title`, `createdAt`, `cid?`, `mode?: "pds" \| "site"`. `id` is the dnd-kit sortable id (`a:{slug}`). In `"pds"` mode (default): Delete button removes the record from the PDS. In `"site"` mode: Remove button removes the article from the site record only (`_intent=removeArticle, uri`). Also exports `ArticleItemPreview` (hook-free version for use inside `DragOverlay`). |
| `GroupList` | `app/components/GroupList/GroupList.tsx` | `<ul>` wrapper for a list of `GroupItem` components. Props: `children`. |
| `GroupItem` | `app/components/GroupItem/GroupItem.tsx` | Individual group row. Props: `id`, `uri?`, `cid?`, `title`, `slug`, `articleChildren: TreeArticle[]`, `isRoot?: boolean`, `articleMode?: "pds" \| "site"`. Also exports `GroupItemPreview` (hook-free, for `DragOverlay`, `uri?` optional) and the `TreeArticle` interface (`cid?` optional). `id` is the dnd-kit sortable id (`g:{slug}`). When `isRoot` is true, renders the `title` prop as the heading with no drag handle or delete button. Named groups include a Delete Group button (disabled when group has children). `articleMode` is forwarded to each `ArticleItem` child. `uri`/`cid` are omitted for site-embedded groups. |
| `Select` | `app/components/Select/Select.tsx` | Select input. Exports `SelectOption` interface `{ value: string; label: string }`. Single-select mode: props `name`, `options`, `label?`, `error?`, `id?`, `value?: string`, `onChange?: (value: string) => void` — renders a `<select>` element. Multi-select mode: add `multiple` prop; `value` becomes `string[]`, `onChange` becomes `(value: string[]) => void` — renders a checkbox list. Both modes post standard form values under `name`. |
| `AsideMenu` | `app/components/AsideMenu/AsideMenu.tsx` | Navigation sidebar — dashboard, sites (links to `/sites`), article list (also links to `/sites` — navigate from there into a site's article management), create article, logout. Rendered by the core layout. Nav items are driven by a `MENU_CONFIG` array; add entries there to extend the menu. |
| `SvgIcon` | `app/components/SvgIcon/SvgIcon.tsx` | Renders SVG icons. Props: `name: SvgImageList` (enum), `className?`, `stroke?`, `strokeWidth?`, `fill?`, `background?`, `text?`. |
| `Tooltip` / `TooltipBubble` | `app/components/Tooltip/Tooltip.tsx` | CSS-anchor-based tooltip. `Tooltip` props: `children`, `anchorName`, `anchorContent`, `anchorPosition`, `zIndex?`. |

## Client metadata

`/client-metadata.json` is served by `app/routes/client-metadata.ts` — a resource route that generates the JSON dynamically from `PUBLIC_URL` at request time. This means the `client_id` and `redirect_uris` are always correct whether running locally via a tunnel or in production, with no manual file edits needed.

Scopes are declared in three places — see the OAuth scopes section above for the full checklist. Any new collection scope must be added to all three. **Users must re-authenticate after a scope change** — existing sessions do not gain new scopes.

## Key commands

```bash
npm run dev          # start dev server (port 5173)
npm run build        # production build
npm run start        # serve production build (port 3008)
npm run typecheck    # react-router typegen + tsc
npx react-router typegen  # regenerate route types after adding routes
```
