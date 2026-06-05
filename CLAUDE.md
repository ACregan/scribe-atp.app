# Scribe ATP

An AT Protocol-driven content management system. Authors write and store articles in their own Bluesky PDS (Personal Data Server); the AT Protocol repository is the database.

## Stack

- **React Router v7** (framework mode, SSR enabled)
- **Vite** (dev server, default port 5173)
- **TypeScript** (strict mode)
- **@atproto/oauth-client-node** — Bluesky OAuth PKCE flow
- **@atproto/api** — AT Protocol XRPC calls (Agent)
- **better-sqlite3** — SQLite store for OAuth state/sessions (`data/oauth.db`)
- **lexical / @lexical/react** (+ @lexical/rich-text, @lexical/list, @lexical/code, @lexical/link, @lexical/html, @lexical/selection) — WYSIWYG rich text editor (article content stored as HTML)
- **@dnd-kit/core**, **@dnd-kit/sortable**, **@dnd-kit/utilities** — drag-and-drop for article/group reordering on `/article/list`
- **classnames** — CSS class composition utility
- **vitest** + **@testing-library/react** + **@testing-library/jest-dom** — unit/component testing
- Production server: `react-router-serve` on port 3008

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Signs the `__session` cookie — must be 32+ random chars |
| `PUBLIC_URL` | Prod | Base URL e.g. `https://scribe-atp.app` — drives `client_id` and `redirect_uri` |
| `DEV_USE_REAL_OAUTH` | Optional | Set to `"true"` to use real Bluesky OAuth in dev (requires tunnel, see below) |
| `DEV_PORT` | Optional | Dev server port if not 5173 |
| `DEV_TUNNEL_HOST` | Optional | Cloudflare tunnel hostname (without `https://`) — added to Vite's `allowedHosts` so the dev server accepts requests from the tunnel URL |

The app will throw on startup if `SESSION_SECRET` is missing.

## Routes

```
/                              home            — dashboard: quick actions, unassigned-article alert, recently updated list
/login                         login           — Bluesky OAuth entry point (or dev bypass); centred card UI with sign-up link to bsky.app
/logout                        logout          — destroys session cookie, redirects to /login
/auth/callback                 callback        — OAuth redirect handler, sets session cookie
/article/create                create          — write a new article to the PDS; multi-select assigns to sites; accepts ?site=<rkey> to pre-check a site
/article/list                  list            — site picker + unassigned articles; links into site-list
/article/list/:siteSlug        site-list       — site-scoped article/group management; reads/writes app.scribe.site
/article/list/:siteSlug/new    site-list-new   — same component as site-list; auto-opens Add New Group modal on mount
/article/view/:articleUrl      view            — read-only display of a single article
/article/edit/:articleUrl      edit            — edit an existing article; multi-select manages site assignment
/groups                        groups          — all sites with their groups; splash/logo imagery, folder icons, article count pills; Add New Group modal
/groups/new                    groups-new      — same component as groups; auto-opens Add New Group modal on mount
/sites                         sites           — list, create and delete app.scribe.site records
/sites/new                     sites-new       — same component as sites; auto-opens Add New Site modal on mount
/site/:siteName/configure      configure       — edit site metadata (title, description, images, url, urlPrefix)
```

All routes sit under a shared layout at `app/layout/core/core.tsx`. The core layout fetches the authenticated user's Bluesky profile (displayName, avatar) server-side and renders it in the header. It also hosts:
- `<ToastProvider>` — wraps the entire layout so `useToast()` is available on every route
- `<Spinner overlay />` inside `<main>` — shown whenever `useNavigation().state !== "idle"`, covering the content area during route transitions
- `<footer id="footer-portal-element">` — the portal target for `FooterPortal`

Article routes (`/article/*`) are additionally wrapped by a protected layout at `app/layout/protected/protected.tsx` which redirects unauthenticated requests to `/login` before any route loader runs.

Route types are auto-generated — run `npx react-router typegen` after adding a route to `routes.ts`, or they will be generated on the next `dev`/`build`.

When adding a new route, export a `HydrateFallback` that returns `<Spinner />` — this shows during the brief initial hydration window rather than an unstyled blank or text placeholder:
```tsx
export function HydrateFallback() {
  return <Spinner size="large" />;
}
```

## Auth architecture

All auth logic lives in **`app/services/auth.server.ts`** (server-only, never imported client-side).

### Bluesky OAuth flow (production / `DEV_USE_REAL_OAUTH=true`)

1. User submits their handle on `/login`
2. `oauthClient.authorize(handle, { scope: OAUTH_SCOPE })` sends a PAR request to the user's PDS and returns a redirect URL
3. Browser is redirected to the Bluesky authorisation page
4. On approval, Bluesky redirects to `/auth/callback?code=...&state=...`
5. `oauthClient.callback(params)` exchanges the code for a session
6. The user's DID is resolved to a handle via `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile`
7. DID + handle are stored in a signed `__session` cookie; browser is redirected to `/`

### ⚠️ Critical: scope is set in the authorize() call, not client-metadata

**The `scope` passed to `oauthClient.authorize()` in `login.tsx` is what Bluesky uses for the PAR (Pushed Authorization Request) and what appears on the consent screen.** `clientMetadata.scope` is a secondary fallback that Bluesky may ignore in favour of the per-request scope.

Always pass `OAUTH_SCOPE` explicitly when calling `oauthClient.authorize()`:
```ts
const authUrl = await oauthClient.authorize(cleanHandle, { scope: OAUTH_SCOPE });
```

If scopes seem wrong on the consent screen after a deployment, the bug is almost certainly here, not in `client-metadata.json`. Changing `client-metadata.json` alone will have no effect.

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
| `destroyAuthSession(request, redirectTo)` | Clears `__session` cookie **and** the SQLite `oauth_session` row so re-login triggers a fresh authorization with current scopes — used by the `/logout` route |
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

**To inspect/clear the database on the server:** `sqlite3 data/oauth.db` — e.g. `DELETE FROM oauth_session WHERE sub = 'did:plc:xxx';`

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
  synopsis?: string,
  createdAt: string,     // ISO 8601 — set on create, never changed
  updatedAt: string,     // ISO 8601 — set on create and updated on every edit
}
```

**`app.scribe.site`** — a managed website, rkey = URL-derived slug (e.g. `norobots-blog`):
```ts
{
  $type: "app.scribe.site",
  url: string,            // e.g. "norobots.blog" — domain name
  title: string,
  urlPrefix: string,      // e.g. "blog" — path prefix; composed URL = url + "/" + urlPrefix
  description?: string,   // human-readable description of the site
  splashImageUrl?: string, // hero/banner image
  logoImageUrl?: string,  // site logo
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
  url: string,           // article slug — same as rkey, convenient for consumers who don't want to parse the URI
  splashImageUrl: string | null,
  synopsis: string | null,
  createdAt: string,
  updatedAt?: string,    // mirrors app.scribe.article.updatedAt; absent on refs created before the field was introduced
}
```

Key design decisions for `app.scribe.site`:
- `ownerId` is omitted — the owner is whoever's PDS holds the record (their DID is the repo DID)
- Article refs are objects (not bare AT URIs) with cached metadata to avoid N+1 fetches
- `cid` is deliberately excluded from article refs — fetch live at deletion to avoid stale `swapRecord` failures
- Groups and article order within groups are authoritative — the site record is the manifest
- `updatedAt` is useful for cache invalidation by public readers
- Field naming: `url` and `urlPrefix` are candidates for renaming to `domainName` and `articlesPath` — this is a breaking schema change requiring a nuke + re-add of existing site records; defer until decided
- **ArticleRef mirroring principle:** every field from `app.scribe.article` except `content` should be mirrored in `ArticleRef`. `content` is excluded because it can be arbitrarily large and defeats the purpose of a cached snapshot. Current mirrored fields: `title`, `url`, `splashImageUrl`, `synopsis`, `createdAt`, `updatedAt`. When adding a new article field, add it to `ArticleRef` in the same PR and update the four construction/propagation sites: `create.tsx` (articleRef), `edit.tsx` (newArticleRef), and `siteTree.ts` (`SiteArticleRef` type + `TreeArticleNode` type + both `buildTreeFromSite` maps + both `treeToSiteData` maps).
- **ArticleRef keep-alive:** the edit action (`/article/edit`) always refreshes the ArticleRef in every site the article already belongs to on save (`sitesToRefresh`), in addition to handling add/remove/slug-rename. This means saving an article propagates all ref field changes to all member sites without any manual re-ordering.

The `/site/:siteName/configure` route edits site metadata (`title`, `description`, `splashImageUrl`, `logoImageUrl`, `url`, `urlPrefix`) via a `putRecord` on the existing rkey — no rename complexity since the rkey is derived from the original URL and stays fixed. Optional fields are omitted from the record entirely when left blank (not stored as empty strings).

The `/article/list` route shows two sections: a site picker (links to `/article/list/:siteSlug` for each site) and an **Unassigned Articles** section listing any `app.scribe.article` records not referenced in any site's `articles` or `groups[x].articles`. The loader fetches both article and site records in parallel, builds a `Set` of referenced URIs from all site values, and returns the difference as `orphanedArticles`. The route has a `deleteArticle` action for removing orphaned articles directly. The section is hidden when there are no orphans.

The site picker renders each site as a `SiteListItem` (from `app/components/SiteListItem/`) — a horizontal card showing a splash image thumbnail with a gradient right-edge fade, an overlapping circular logo, the site title, composed URL, and group/article count badges. The loader maps all `SiteData` fields from the site record. Both image fields fall back to a CSS gradient when absent. `onDelete` is not passed here — deletion is only available on `/sites`.

The `/article/list/:siteSlug` route is the site-scoped management view. It reads the site record, builds a DnD tree, and writes the updated site record back. Actions: `createGroup`, `deleteGroup`, `saveSite`, `removeArticle`. **Remove article only removes it from the site record — it does not delete the PDS article record.**

Key behaviours on this route:
- **Dirty tracking** — `savedTreeRef` holds the tree as last saved (initialised from loader, updated on successful save). `isDirty` is computed via `useMemo` using `JSON.stringify` comparison. The Save Order button is disabled until `isDirty` is true.
- **Navigation blocker** — `useBlocker(isDirty)` intercepts any React Router navigation when there are unsaved changes. A modal appears with three options: **Stay** (`blocker.reset()`), **Discard & Leave** (`blocker.proceed()`), **Save & Leave** (triggers save, then calls `blocker.proceed()` from the fetcher effect via `proceedAfterSaveRef`).
- **Save feedback** — success shows a primary toast (auto-expires); error shows a danger toast with `autoExpire: false` so it persists until dismissed.
- **Group create** — `createGroup` action returns `{ ok: true }` (not a redirect) so the fetcher can close the modal automatically. The loader revalidates automatically after any fetcher action; `knownGroupSlugsRef` tracks which group slugs are already in the tree, and a `useEffect` on `site.groups` detects newly added slugs and appends them as empty group nodes. `savedTreeRef` is updated in the same step so new groups don't register as unsaved changes.
- **Group delete** — handled via `deleteFetcher` (not a form redirect). Action returns `{ ok: true, deletedSlug }`; a `useEffect` removes the deleted group from both `tree` and `savedTreeRef` client-side. The `GroupItem` delete button shows `<Spinner size="small" />` while `isDeleting` is true.
- **Add New Group modal** — includes a URL path (slug) field that auto-populates from the title as the user types. Once the user manually edits the slug the auto-fill stops. The slug is immutable after creation (it keys the group in the site record); the modal shows a note to that effect.
- **"Draft New Article" link** — navigates to `/article/create?site=<rkey>` so the current site is pre-checked in the Assign to Sites dropdown on arrival. The create loader validates the rkey against the user's actual sites before applying the preselection.

### Nuke tool

The home page (`/`) contains a developer "Nuke all records" tool. The collections it deletes are defined in `SCRIBE_COLLECTIONS` inside `app/routes/home/home.tsx`:

```ts
const SCRIBE_COLLECTIONS = [
  "app.scribe.article",
  "app.scribe.site",
];
```

When adding a new collection, add it here too so nuke keeps working.

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

The scope list has **a single source of truth**: `OAUTH_SCOPE` exported from `app/services/auth.server.ts`. It is _consumed_ in three places — `clientMetadata.scope` (same file), `app/routes/client-metadata.ts`, and `app/routes/login/login.tsx` — but **only needs to be edited in one place**. Adding a new scope: update `OAUTH_SCOPE` only.

**Users must re-authenticate after a scope change** — existing sessions do not gain new scopes. To revoke an existing authorization: go to **https://bsky.social/account** → find the app entry → revoke. Then log in again to get a fresh token with the updated scopes.

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
| `Button` | `app/components/Button/Button.tsx` | All `<button>` HTML attrs + `variant?: "primary" \| "secondary" \| "danger"` (default `"primary"`) + `icon?: SvgImageListTypes` — when provided, renders the icon in a 1.6rem `inline-flex` span to the left of the label using `fill="currentColor"` so it inherits the button's text colour across all variants |
| `IconBadge` | `app/components/IconBadge/IconBadge.tsx` | Circular blue badge containing an SVG icon. Props: `icon: SvgImageListTypes`, `size?: "small" \| "large"` (default `"small"`). Small = 3rem × 3rem, large = 6rem × 6rem (matches `headingIconContainer` in `PageContainer`). Use for inline row decoration; `PageContainerHeading` uses equivalent inline styles directly. |
| `RichTextEditor` | `app/components/RichTextEditor/RichTextEditor.tsx` | `name: string`, `label?: string`, `defaultValue?: string` — drop-in for `<textarea>`, outputs HTML into a hidden field on form submit. Client-only (falls back to plain textarea during SSR). Toolbar implemented in `ToolbarPlugin.tsx` (see below). |
| `Modal` | `app/components/Modal/Modal.tsx` | `isOpen: boolean`, `onClose: () => void`, `title: string`, `footer?: ReactNode`, `children: ReactNode` — renders via `createPortal` into `document.body`. Closes on Escape key. |
| `useModal` | `app/components/Modal/useModal.ts` | Hook returning `{ isOpen, open, close }` — use alongside `Modal` to manage open state. |
| `PageContainerHeading` | `app/components/PageContainer/PageContainer.tsx` | Styled page heading with an icon badge. Props: `icon: SvgImageListTypes`, `children: ReactNode`. Renders a circular blue badge containing the icon alongside an `<h1>`. Pass as the `title` prop of `PageContainer` — every app route does this: `<PageContainer title={<PageContainerHeading icon={SvgImageList.Document}>Create Article</PageContainerHeading>}>`. Exported from the same file as `PageContainer`. |
| `PageContainer` | `app/components/PageContainer/PageContainer.tsx` | Page-level layout wrapper. Props: `children`, `title?: ReactNode` (string renders as `<h1>`), `topButtons?: ReactNode`, `bottomButtons?: ReactNode`. `bottomButtons` children are spaced with `gap: 1rem`. Also exports `PageSection` (a simple content-dividing wrapper, `children` only), `PageSectionCell` (a bordered cell within a row, `children` only), and `PageContainerHeading` from the same file. |
| `ArticleForm` | `app/components/ArticleForm/ArticleForm.tsx` | Shared form fields for article create and edit. Props: `defaultTitle?`, `defaultUrl?`, `defaultSplashImageUrl?`, `defaultContent?`, `sites: SiteOption[]`, `selectedSites: string[]`, `onSitesChange: (rkeys: string[]) => void`, `error?: string`. Renders Title, URL slug, Splash image URL, site multi-select, and RichTextEditor inside `PageSection` wrappers. Re-exports `SiteOption` from `~/components/types`. Hidden fields (`cid`, `oldSiteRkeys`), the submit button, and `FooterPortal` stay in the individual route components. |
| `ArticleList` | `app/components/ArticleList/ArticleList.tsx` | `<ul>` wrapper for a list of `ArticleItem` components. Props: `children`. |
| `ArticleItem` | `app/components/ArticleItem/ArticleItem.tsx` | Individual article row. Props: `id`, `uri`, `title`, `createdAt`, `cid?`, `mode?: "pds" \| "site"`. `id` is the dnd-kit sortable id (`a:{slug}`). In `"pds"` mode (default): Delete button removes the record from the PDS. In `"site"` mode: Remove button removes the article from the site record only (`_intent=removeArticle, uri`). Also exports `ArticleItemPreview` (hook-free version for use inside `DragOverlay`). |
| `GroupList` | `app/components/GroupList/GroupList.tsx` | `<ul>` wrapper for a list of `GroupItem` components. Props: `children`. |
| `GroupItem` | `app/components/GroupItem/GroupItem.tsx` | Individual group row. Props: `id`, `uri?`, `cid?`, `title`, `slug`, `articleChildren: TreeArticle[]`, `isRoot?: boolean`, `articleMode?: "pds" \| "site"`, `onDeleteConfirm?: (slug: string) => void`, `isDeleting?: boolean`. Also exports `GroupItemPreview` (hook-free, for `DragOverlay`, `uri?` optional) and re-exports `TreeArticle` from `~/components/types`. `id` is the dnd-kit sortable id (`g:{slug}`). When `isRoot` is true, renders the `title` prop as the heading with no drag handle or delete button. Named groups include a Delete Group button (disabled when group has articles). When `onDeleteConfirm` is provided, confirmation calls it instead of submitting the form natively — this is the correct path for fetcher-based deletes. `isDeleting` replaces the trash icon with `<Spinner size="small" />` and disables the button. `articleMode` is forwarded to each `ArticleItem` child. |
| `Select` | `app/components/Select/Select.tsx` | Select input. Exports `SelectOption` interface `{ value: string; label: string }`. Single-select mode: props `name`, `options`, `label?`, `error?`, `id?`, `value?: string`, `onChange?: (value: string) => void` — renders a `<select>` element. Multi-select mode: add `multiple` prop; `value` becomes `string[]`, `onChange` becomes `(value: string[]) => void` — renders a dropdown trigger styled like `<select>` that opens a checkbox list on click; collapses showing "Select options" / single label / "{n} selected" summary; closes on click-outside or Escape. Both modes post standard form values under `name` (multi-select uses hidden inputs per selected value). |
| `AsideMenu` | `app/components/AsideMenu/AsideMenu.tsx` | Navigation sidebar — dashboard, sites (`/sites`), groups (`/groups`), articles (`/article/list` — navigate from there into a site's article management), create article, logout. Rendered by the core layout. Nav items are driven by a `MENU_CONFIG` array; add entries there to extend the menu. |
| `SvgIcon` | `app/components/SvgIcon/SvgIcon.tsx` | Renders SVG icons. Props: `name: SvgImageList` (enum), `className?`, `stroke?`, `strokeWidth?`, `fill?`, `background?`, `text?`. |
| `Tooltip` / `TooltipBubble` | `app/components/Tooltip/Tooltip.tsx` | CSS-anchor-based tooltip. `Tooltip` props: `children`, `anchorName`, `anchorContent`, `anchorPosition`, `zIndex?`. |
| `SiteTile` | `app/components/SiteTile/SiteTile.tsx` | Card tile for a single site. Props: `site: SiteData`, `onDelete: (site: SiteData) => void`, `isDeleting?: boolean`. Renders splash image (or gradient placeholder), logo, title, description, composed URL, and Manage / Configure / Delete actions. Re-exports `SiteData` from `~/components/types`. |
| `SiteListItem` | `app/components/SiteListItem/SiteListItem.tsx` | Horizontal list-row card for a single site. Props: `site: SiteData`, `onDelete?: (site: SiteData) => void`, `isDeleting?: boolean`. Renders a splash thumbnail with gradient right-edge fade, an overlapping circular logo, site title, composed URL, group/article count badges, and Manage Articles / Configure / Delete actions. `onDelete` is optional — omit it on pages that don't support deletion (e.g. `/article/list`). Re-exports `SiteData` from `~/components/types`. Used alongside `SiteTile` on `/sites` — both lists are always rendered and toggled with `display: none` so background images stay in memory across view switches. |
| `FooterPortal` | `app/components/FooterPortal/FooterPortal.tsx` | Portals `children` into `<footer id="footer-portal-element">` in the core layout. Default export. Props: `children: ReactNode`. Client-only — uses a `mounted` guard (same pattern as `RichTextEditor`) to avoid SSR crashes from `document.getElementById`. **Note:** portaled buttons must use `form="form-id"` to associate with a `<form>` elsewhere in the DOM — they are no longer DOM descendants of the form. For navigation (non-form) footer actions, wrap `<Button>` in `<Link>` — `core.module.css` handles spacing for the `footer > a > button` selector. |
| `Spinner` | `app/components/Spinner/Spinner.tsx` | Spinning ring indicator. Props: `overlay?: boolean`, `size?: "small" \| "medium" \| "large"` (default `"medium"`). Without `overlay`: renders the ring inline. With `overlay`: wraps the ring in a `position: fixed` overlay sized to the content area (below the header, beside the aside) that dims everything behind it. Used in `core.tsx` as `<Spinner overlay />` during route navigations. Use `size="large"` in `HydrateFallback` exports; use `size="small"` for inline button states. |
| `Toast` / `ToastContainer` / `Toasts` | `app/components/Toast/Toast.tsx` | `Toast` renders a single notification. Props: all fields from `ToastPropsWithId` (see ToastContext). Auto-dismisses via `useEffect` + `setTimeout` when `autoExpire` is true. Cleanup cancels the timer if the toast is removed manually first. `ToastContainer` is a plain wrapper div. `Toasts` reads all active toasts from context via `useToast()` and renders them. |
| `ToastProvider` / `useToast` | `app/components/Toast/ToastContext.tsx` | Context provider wired into `core.tsx` — wraps the entire layout so `useToast()` works anywhere in the app. `useToast()` returns `{ toasts, addToast, removeToast }`. `addToast(props: ToastProps)` generates a UUID, binds `removeToast`, and appends to state. `removeToast` is `useCallback`-memoized with `[]` deps so its reference is stable — without this, adding a new toast would reset all existing timers. Exports: `ToastProvider`, `useToast`, `ToastProps`, `ToastPropsWithId`. `ToastProps`: `heading`, `content?`, `autoExpire?` (default `true`), `expireTimeSeconds?` (default `5`), `variant?: "primary" \| "secondary" \| "danger"`. |

### RichTextEditor — toolbar

The toolbar lives in `app/components/RichTextEditor/ToolbarPlugin.tsx` and is registered as a Lexical plugin inside `RichTextEditor.tsx`. Features, left to right:

| Section | Controls |
|---|---|
| History | Undo, Redo |
| Block type | Dropdown: Normal, H1–H6, Bullet List, Numbered List, Check List, Quote, Code Block |
| Font | Family `<select>` (Arial / Courier New / Georgia / Times New Roman / Trebuchet MS / Verdana) |
| Font size | Number input + − / + step buttons |
| Inline format | **Bold**, *Italic*, Underline |
| Code / Link | Inline code `</>`, Link 🔗 (shows URL input inline when inserting) |
| Colour | Text colour swatch (native colour picker), Background colour swatch |
| Format ▾ | Strikethrough, Subscript, Superscript, Highlight, Lowercase, Uppercase, Capitalise, Clear formatting |
| Align ▾ | Left, Center, Right, Justify, Start, End, Outdent, Indent |
| Speech | 🎤 Speech-to-text via Web Speech API (browser-dependent; inserts recognised text at cursor) |

Toolbar buttons use `onMouseDown + e.preventDefault()` (not `onClick`) to avoid stealing editor focus.

All theme classes for Lexical nodes (headings, lists, code highlight tokens, links, text formats) are defined in `RichTextEditor.module.css` and wired into the `theme` object in `RichTextEditor.tsx`.

### RichTextEditor — Lexical v0.44 compatibility notes

- **`$setBlocksType`** is not exported by `@lexical/utils` in v0.44. It is implemented locally in `ToolbarPlugin.tsx`. If upgrading Lexical, check whether it becomes available in `@lexical/utils` and remove the local copy.
- **`LexicalCodeHighlightPlugin`** does not exist as a named export from `@lexical/react` in v0.44. Code syntax highlighting is registered via `registerCodeHighlighting(editor)` from `@lexical/code` inside a `useEffect` in a small `CodeHighlightPlugin` wrapper defined inline in `RichTextEditor.tsx`. `registerCodeHighlighting` is marked deprecated upstream but is the correct v0.44 approach.
- **Web Speech API** (`SpeechRecognition`, `SpeechRecognitionEvent`) has no TypeScript lib types. Local interface declarations are provided at the top of `ToolbarPlugin.tsx` — do not add `@types/dom-speech-recognition` unless TS starts complaining about conflicts.

## Shared constants

`app/constants.ts` is the single source of truth for string literals and regexes that appear in multiple route files. Import from here rather than redeclaring locally:

| Export | Value | Used in |
|---|---|---|
| `ARTICLE_COLLECTION` | `"app.scribe.article"` | create, edit, view, home |
| `SITE_COLLECTION` | `"app.scribe.site"` | sites, site-list, list, configure, create, edit, home |
| `SLUG_RE` | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` | article create, edit, site-list group create |
| `DOMAIN_RE` | `/^[a-zA-Z0-9][a-zA-Z0-9\-._]*\.[a-zA-Z]{2,}$/` | sites, configure |

`app/services/auth.server.ts` also exports two server-only constants consumed by `client-metadata.ts`:
- `PUBLIC_URL_DEFAULT` — the `"https://scribe-atp.app"` fallback string
- `OAUTH_METADATA_STATIC` — the stable OAuth client config fields (`grant_types`, `response_types`, etc.) shared between the `NodeOAuthClient` config and the `/client-metadata.json` response

## Shared component types and utilities

`app/components/types.ts` is the canonical home for interfaces shared across two or more components or route loaders. Import from here rather than from individual component files:

| Export | Used in |
|---|---|
| `SiteData` | `SiteTile`, `SiteListItem`, `sites.tsx` loader, `list.tsx` loader |
| `SiteOption` | `ArticleForm`, `create.tsx`, `edit.tsx` |
| `TreeArticle` | `GroupItem`, `site-list.tsx` |

`SiteData` shape:
```ts
{
  rkey: string;
  cid: string;
  title: string;
  url: string;
  urlPrefix: string;
  description?: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groupCount: number;
  articleCount: number;
}
```

`app/components/utils.ts` is the canonical home for pure utility functions shared across components:

| Export | Purpose |
|---|---|
| `composedUrl(site: SiteData)` | Returns `url/urlPrefix` or just `url` when prefix is empty |

Components that originally defined these types/utils inline (`SiteTile`, `ArticleForm`, `GroupItem`) now import from the shared files and re-export for backwards compatibility. When adding a new shared type or utility, add it here rather than inside a component file.

**Note:** `app/routes/article/site-list/siteTree.ts` has its own `SiteData` type (with `groups`/`articles` arrays for the DnD tree) that is structurally different from the component-layer `SiteData` above. These serve different purposes and are intentionally kept separate to avoid cross-layer coupling.

## Modal-backed route pattern

Several routes exist solely to auto-open a modal on an existing page. They reuse the same component file as their parent route but carry a distinct route `id` to avoid the duplicate-id error React Router raises when two routes point to the same file:

```ts
// routes.ts
route("sites", "./routes/sites/sites.tsx"),
route("sites/new", "./routes/sites/sites.tsx", { id: "sites-new" }),
```

Inside the shared component, detect the `/new` suffix and open the modal in a one-shot `useEffect`:

```tsx
const { pathname } = useLocation();
const isNewRoute = pathname.endsWith("/new");
const navigate = useNavigate();

const openedByRouteRef = useRef(false);
useEffect(() => {
  if (isNewRoute && !openedByRouteRef.current) {
    openedByRouteRef.current = true;
    open(); // from useModal()
  }
}, []);

function handleCloseModal() {
  close();
  if (isNewRoute) navigate("/base-path", { replace: true });
}
```

Use `handleCloseModal` everywhere `close` was previously used (`onClose` prop and any cancel buttons) so that closing the modal on the `/new` route navigates back to the base route and keeps browser history clean.

**Current modal-backed routes:**

| `/new` route | Base route | Modal opened |
|---|---|---|
| `/sites/new` | `/sites` | Add New Site |
| `/groups/new` | `/groups` | Add New Group |
| `/article/list/:siteSlug/new` | `/article/list/:siteSlug` | Add New Group |

The dashboard Quick Actions link directly to these `/new` routes. When `useBlocker(isDirty)` is active (e.g. on site-list), navigating to `/new` with unsaved changes correctly triggers the "Unsaved changes" modal before proceeding.

**Note on Vite HMR:** after adding a new route to `routes.ts`, a hard browser refresh is sometimes needed before the route is recognised. If the modal doesn't open on first test, hard-refresh before debugging further.

## Toast + navigate pattern

Routes that save and then redirect (e.g. `article/edit`, `site/configure`) use this pattern so the toast survives the navigation:

```ts
// action — return data instead of redirect
return { ok: true, title };

// component
const navigate = useNavigate();
const { addToast } = useToast();

useEffect(() => {
  if (!actionData?.ok) return;
  addToast({ heading: "Saved", content: actionData.title, variant: "primary" });
  navigate("/destination");
}, [actionData]);
```

This works because `ToastProvider` is mounted at the core layout level and persists across React Router soft navigations — the toast state is not reset when the route changes.

## Client metadata

`/client-metadata.json` is served by `app/routes/client-metadata.ts` — a resource route that generates the JSON dynamically from `PUBLIC_URL` at request time. This means the `client_id` and `redirect_uris` are always correct whether running locally via a tunnel or in production, with no manual file edits needed. The response includes `Cache-Control: no-store`.

The `client_id` is a plain URL (`${publicUrl}/client-metadata.json`) with no version query string. Versioning was tried as a cache-busting tactic but turned out to be unnecessary — the real scope issue was in `login.tsx` (see the critical note in the Auth section above).

**To add a new OAuth scope:** update `OAUTH_SCOPE` in `app/services/auth.server.ts` only — `client-metadata.ts` and `login.tsx` consume it automatically. Then ask users to re-authenticate (revoke at https://bsky.social/account and log in again).

## Public hooks (`app/hooks/`)

`app/hooks/` (re-exported via `app/hooks/index.ts`) provides React hooks that read Scribe ATP data directly from the AT Protocol — no auth, no API backend. Intended to be copied into consumer websites (not imported as a package — there is no published npm artifact yet).

### Hooks

| Hook | Signature | Returns |
|---|---|---|
| `useSite` | `(author: string, siteSlug: string)` | `{ site: Site \| null, loading: boolean, error: Error \| null }` — fetches the full site manifest (groups, ungrouped articles, metadata) |
| `useArticle` | `(author: string, articleSlug: string)` | `{ article: Article \| null, loading: boolean, error: Error \| null }` — fetches a single article including HTML content |

Both hooks cancel the in-flight fetch on unmount and on parameter change.

### Helper functions (pure, no hooks)

| Function | Purpose |
|---|---|
| `slugFromUri(uri)` | Returns the final path segment of an AT URI (the rkey / article slug) |
| `flattenArticles(site)` | Returns all articles from a site in order: each group's articles followed by top-level ungrouped articles |

### Types (exported from `app/hooks/types.ts`)

```ts
ArticleRef  { uri, title, url?, splashImageUrl, synopsis?, createdAt, updatedAt? }
SiteGroup   { slug, title, articles: ArticleRef[] }
Site        { title, url, urlPrefix, description?, splashImageUrl?, logoImageUrl?, groups: SiteGroup[], articles: ArticleRef[] }
Article     { title, content, url, splashImageUrl?, synopsis?, createdAt, updatedAt? }
```

`ArticleRef` is the cached snapshot stored inside a `Site` record. `Article` is the full article record including HTML `content`.

### ⚠️ PDS endpoint limitation

All requests proxy through `https://public.api.bsky.app`. This works for `did:plc` identifiers on bsky.social but will fail for `did:web` or self-hosted PDS instances. Resolving the correct PDS URL requires calling `com.atproto.identity.resolveDid` and checking the `#atproto_pds` service endpoint — not yet implemented.

### Handle resolution

`author` can be a handle (e.g. `"user.bsky.social"`) or a DID — the hooks resolve handles to a DID via `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle` before fetching.

## Testing

The project uses **Vitest** with **React Testing Library** for component unit tests, plus pure function tests for data-transformation utilities.

### Config

- `vitest.config.ts` — standalone Vitest config (separate from `vite.config.ts`); sets `jsdom` environment, global test APIs, `~/` alias
- `test.setup.ts` — global setup: imports `@testing-library/jest-dom` matchers and registers an `afterEach` cleanup
- `vite.config.ts` skips the `reactRouter()` plugin when `process.env.VITEST` is set, preventing React Router's build plugin from interfering with tests

### Test file conventions

- Component tests co-located: `app/components/Foo/Foo.test.tsx`
- Utility/pure-function tests co-located with source: `app/hooks/utils.test.ts`, `app/constants.test.ts`, `app/routes/article/site-list/siteTree.test.ts`
- Child components are mocked with `vi.mock(...)` to isolate the component under test
- React Router primitives (`Form`, `Link`, `NavLink`) are mocked per-file
- dnd-kit hooks (`useSortable`, `useDndContext`) are mocked to return static values; `vi.hoisted()` is required for any mock variable referenced inside a `vi.mock()` factory
- Lexical editor internals are mocked wholesale in `RichTextEditor.test.tsx` and `ToolbarPlugin.test.tsx`; `useLexicalComposerContext` is mocked via `vi.hoisted`

### Test philosophy

- **Prefer testing observable behaviour** over implementation details — what the user sees, what handlers get called, what the DOM communicates
- **Pure function tests** are highest value: no mocking needed and they catch silent data corruption (e.g. the `buildTreeFromSite`/`treeToSiteData` round-trip catching a dropped field)
- **Component tests** mock aggressively to isolate the unit; they verify rendering and interaction, not business logic
- **Business logic lives in route loaders/actions** — those are the next priority for test coverage

### siteTree utilities

`app/routes/article/site-list/siteTree.ts` contains the pure data-transformation functions extracted from `site-list.tsx`:

| Export | Purpose |
|---|---|
| `buildTreeFromSite(site)` | Converts a `SiteData` record into a `TreeGroupNode[]` DnD tree (root node + named groups) |
| `treeToSiteData(tree)` | Inverse — converts the DnD tree back to `{ groups, articles }` for writing to the PDS |
| `toSlug(title)` | Converts a group title to a URL slug (lowercase, spaces→hyphens, strip specials) |
| `slugFromUri(uri)` | Returns the final path segment of an AT URI |
| `articleId(slug)` / `groupId(slug)` | Produces the dnd-kit sortable id (`a:{slug}` / `g:{slug}`) |

**Critical invariant:** `treeToSiteData(buildTreeFromSite(site))` must reproduce the original `{ groups, articles }` exactly — including every `ArticleRef` field (`url`, `synopsis`, `splashImageUrl`, etc.). The round-trip tests in `siteTree.test.ts` enforce this.

### Running tests

```bash
npm test             # watch mode
npm run test:run     # single run (CI)
npm run test:coverage  # with coverage report
```

### Current coverage

All components in `app/components/` have test suites. Pure function coverage:

| File | What's tested |
|---|---|
| `app/constants.test.ts` | `SLUG_RE`, `DOMAIN_RE` valid/invalid cases; collection name constants |
| `app/hooks/utils.test.ts` | `slugFromUri`, `flattenArticles` ordering, `resolveIdentifier` (DID passthrough, handle fetch, error) |
| `app/routes/article/site-list/siteTree.test.ts` | `toSlug`, `buildTreeFromSite` field mapping, `treeToSiteData`, full round-trip suite |

**Next priority:** route loader/action tests (slug validation, site assignment logic, orphan detection).

## Key commands

```bash
npm run dev          # start dev server (port 5173)
npm run build        # production build
npm run start        # serve production build (port 3008)
npm run typecheck    # react-router typegen + tsc
npm test             # run tests in watch mode
npm run test:run     # run tests once (CI)
npx react-router typegen  # regenerate route types after adding routes
```
