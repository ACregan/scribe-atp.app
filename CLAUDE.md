# Scribe ATP

An AT Protocol-driven content management system. Authors write and store articles in their own Bluesky PDS (Personal Data Server); the AT Protocol repository is the database.

## Project documentation

| File                     | Purpose                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| `CLAUDE.md`              | This file — architecture, patterns, and conventions for AI-assisted development  |
| `PLANNING.md`            | Feature specs and implementation notes (planned and completed)                   |
| `UBIQUITOUS_LANGUAGE.md` | Canonical glossary of domain terms — use these names in code, UI, and discussion |
| `docs/adr/`              | Architecture Decision Records — why significant structural decisions were made   |

## Stack

- **React Router v8** (framework mode, SSR enabled)
- **Vite** (dev server, default port 5173)
- **TypeScript** (strict mode)
- **@atproto/oauth-client-node** — Bluesky OAuth PKCE flow
- **@atproto/api** — AT Protocol XRPC calls (Agent)
- **better-sqlite3** — SQLite store for OAuth state/sessions (`data/oauth.db`)
- **lexical / @lexical/react** (+ @lexical/rich-text, @lexical/list, @lexical/code, @lexical/link, @lexical/html, @lexical/selection) — WYSIWYG rich text editor (article content stored as HTML)
- **@dnd-kit/core**, **@dnd-kit/sortable**, **@dnd-kit/utilities** — drag-and-drop for article/group reordering on `/article/list`
- **classnames** — CSS class composition utility
- **pino** — structured JSON logging to stdout; shared logger at `shared/logger.ts`, re-exported for app routes via `app/services/logger.server.ts`
- **isomorphic-dompurify** — server-side HTML sanitisation for article content rendered via `dangerouslySetInnerHTML`
- **vitest** + **@testing-library/react** + **@testing-library/jest-dom** — unit/component testing
- **@playwright/test** — E2E browser testing (Chromium)
- Production server: `react-router-serve` on port 3008

## Environment variables

| Variable             | Required      | Purpose                                                                                                                                 |
| -------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`     | Yes           | Signs the `__session` cookie — must be 32+ random chars. Also shared with the Image Service for session verification.                   |
| `PUBLIC_URL`         | Prod          | Base URL e.g. `https://scribe-atp.app` — drives `client_id` and `redirect_uri`                                                          |
| `DEV_USE_REAL_OAUTH` | Optional      | Set to `"true"` to use real Bluesky OAuth in dev (requires tunnel, see below)                                                           |
| `DEV_PORT`           | Optional      | Dev server port if not 5173                                                                                                             |
| `DEV_TUNNEL_HOST`    | Optional      | Cloudflare tunnel hostname (without `https://`) — added to Vite's `allowedHosts` so the dev server accepts requests from the tunnel URL |
| `IMAGE_STORAGE_ROOT` | Image Service | Absolute filesystem path where uploaded image Variants are stored (e.g. `/var/scribe/images`). Used by the Image Service only.          |

The app will throw on startup if `SESSION_SECRET` is missing.

## Routes

```
/                                        home                  — public landing page for unauthenticated visitors; dashboard for authenticated users (quick actions, unassigned-article alert, recently updated list with Edit links)
/login                                   login                 — Bluesky OAuth entry point (or dev bypass); centred card UI with sign-up link to bsky.app
/logout                                  logout                — destroys session cookie, redirects to /login
/auth/callback                           callback              — OAuth redirect handler, sets session cookie
/contributor-invitations/respond         respond-invite        — resource route, no page — Accept/Reject fetcher target for the global Contributor-invitation modal
/article/create                          create                — write a new article to the PDS; every new article starts loose (unassigned) — no site picker here (ADR 0013)
/article/resolve-contributor             resolve-contributor   — resource route — resolves a Bluesky handle/DID to a profile for adding a Contributor
/article/list                            list                  — global article list: Site-Assigned Articles + Unassigned Drafts, with the consolidated Publish action (site → group, with create-group)
/article/list/:siteSlug                  site-list             — site-scoped group management; reads/writes site.standard.publication; Unpublish returns an article to loose
/article/list/:siteSlug/new              site-list-new         — same component as site-list; auto-opens Add New Group modal on mount
/article/view/:articleUrl                view                  — read-only display of a single article
/article/edit/:articleUrl                edit                  — edit an existing article; site/group assignment is exclusively the Publish/Unpublish actions' job, not editing
/article/review/:contributorDid/:rkey    review                — review screen for a Contributor's submitted article — Approve/Reject
/article/site-chat/:siteSlug             site-chat             — resource route, no page — polling/resolve endpoint backing the Site Chat panel (Bluesky DM-based group chat, ADR 0016/0025/0026)
/groups                                  groups                — all sites with their groups; splash/logo imagery, folder icons, article count pills; Add New Group modal
/groups/new                              groups-new            — same component as groups; auto-opens Add New Group modal on mount
/sites                                   sites                 — list, create and delete site.standard.publication records
/sites/new                               sites-new             — same component as sites; auto-opens Add New Site modal on mount
/site/:siteName/configure                configure             — edit site metadata (title, description, images, url, urlPrefix)
/images                                  image-library         — Image Library: browse, upload, organise, and copy URLs for images; shared across all users
/insights                                insights              — analytics dashboard: Umami-backed pageviews/visitors plus in-house Like/Subscribe/Share engagement charts
/devtools/update-img-to-srcset           update-img-to-srcset  — one-off, self-scoped devtools migration tool — backfills srcset onto pre-existing articles' embedded images; slated for deletion once all accounts are migrated
```

All routes sit under a shared layout at `app/layout/core/core.tsx`. The core layout fetches the authenticated user's Bluesky profile (displayName, avatar) server-side and renders it in the header. It also hosts:

- `<ToastProvider>` — wraps the entire layout so `useToast()` is available on every route
- `<Spinner overlay />` inside `<main>` — shown whenever `useNavigation().state !== "idle"`, covering the content area during route transitions
- `<footer id="footer-portal-element">` — the portal target for `FooterPortal`
- Skip-to-content link — `<a href="#main-content">Skip to main content</a>` rendered before the layout grid; `<main id="main-content">` is the target
- Collapsible aside — `asideExpanded` state (default `false`) is stored in `localStorage` under `"aside-expanded"`. The `<div data-aside-state="hidden|collapsed|expanded">` attribute drives CSS grid transitions between `0 1fr`, `6rem 1fr`, and `20rem 1fr` column widths. `AsideMenu` receives `expanded: boolean` and `onToggle: () => void` props.

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
const authUrl = await oauthClient.authorize(cleanHandle, {
  scope: OAUTH_SCOPE,
});
```

If scopes seem wrong on the consent screen after a deployment, the bug is almost certainly here, not in `client-metadata.json`. Changing `client-metadata.json` alone will have no effect.

### Session cookie

`createCookieSessionStorage` from `react-router`. Cookie name `__session`, `httpOnly`, `sameSite: lax`, HTTPS-only in production.

Stored fields: `did` (string), `handle` (string).

Key exports from `auth.server.ts`:

| Function                                                  | Purpose                                                                                                                                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAuthSession(request)`                                 | Reads session cookie — returns `{ did, handle, isAuthenticated }` (all optional)                                                                                                                    |
| `requireAuth(request)`                                    | Like `getAuthSession` but throws a redirect to `/login` if not authenticated — returns `{ did, handle }` non-optional                                                                               |
| `getAtpAgent(did)`                                        | Restores OAuth session from SQLite and returns an `Agent` — throws redirect to `/login` on failure                                                                                                  |
| `requireAtpAgent(request)`                                | Combines `requireAuth` + `getAtpAgent` — returns `{ agent, did, handle }`. Use in route loaders/actions: check `useRealOAuth` and return mock first, then call `requireAtpAgent` for the real path. |
| `createAuthSession(request, { did, handle }, redirectTo)` | Writes session cookie and redirects                                                                                                                                                                 |
| `destroyAuthSession(request, redirectTo)`                 | Clears `__session` cookie **and** the SQLite `oauth_session` row so re-login triggers a fresh authorization with current scopes — used by the `/logout` route                                       |
| `useRealOAuth`                                            | Boolean constant — `true` in production or when `DEV_USE_REAL_OAUTH=true`                                                                                                                           |

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

### Collections overview

All articles live in `site.standard.document`. There is no separate draft collection — a document's own `site` field is the sole loose-vs-published signal (see ADR 0013, `docs/adr/0013-*.md`): a plain `https://reader.scribe-atp.app/<did>/site.standard.document/<rkey>` URL means the document is loose (unassigned, not in any publication's manifest); an `at://` publication URI means it's published into that publication, referenced in `groups[].articles` there. **A document belongs to at most one publication, ever** — assignment and publication happen together, atomically, via the single Publish action (in `/article/list`). `ungroupedArticles` still exists in the `site.standard.publication` schema for backwards compatibility with old records, but no UI path can populate it anymore — every current write path either leaves a document fully loose or puts it straight into a named group.

### rkey = TID

Article rkeys are AT Protocol TIDs (timestamp-based IDs), e.g. `3mp4hfovqib2h`. The `slug` field is stored as a human-readable string inside the record (e.g. `my-article-title`) but is **not** the rkey.

- Article AT URI: `at://did/site.standard.document/3mp4hfovqib2h`
- Publication AT URI: `at://did/site.standard.publication/3mp4hfovqib2s`
- The edit route `/article/edit/:articleUrl` resolves the article by scanning records for a matching `path.split('/').pop()` (the slug segment), not by direct rkey lookup

**Slug format:** `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` — validated server-side on create and edit.

### Renaming a slug

AT Protocol records cannot be moved to a different rkey in-place. Renaming the slug in the edit form triggers:

1. `createRecord` at the new rkey with updated content
2. `deleteRecord` on the old rkey (best-effort — logged but not fatal if it fails)

This breaks any existing AT URIs pointing to the old rkey.

### Collections

**`app.scribe.article`** — legacy collection, no longer used. All articles are `site.standard.document`.

**`site.standard.document`** — all articles (both in-progress and published), rkey = TID:

> **Golden rule:** Top-level fields must comply with the site.standard lexicon spec. Anything not in the spec goes inside the `scribe` extension object — never at the top level.

```ts
{
  // SPEC — top-level only, per site.standard.document lexicon
  $type: "site.standard.document",
  site: string,                              // ADR 0013: loose-vs-published signal. Either the AT URI of the owning
                                              // publication ("at://did:plc:.../site.standard.publication/3abc") once
                                              // published, or a loose reader URL
                                              // ("https://reader.scribe-atp.app/<did>/site.standard.document/<rkey>")
                                              // before publish. Never a bare domain string. Set only at genuine
                                              // publish/unpublish time — see buildLooseSiteUrl/buildLooseDocumentFields
                                              // in article.server.ts, the single source of truth for the loose shape.
  title: string,
  publishedAt?: string,                      // ISO 8601 — omitted if blank
  path?: string,                             // e.g. "/engineering/my-article" or "/my-article"
  description?: string,
  coverImage?: blob,                         // <1MB thumbnail
  content?: { $type: "app.scribe.content.html", html: string },
  textContent?: string,                      // plaintext stripped from content HTML
  bskyPostRef?: { uri: string, cid: string },
  tags?: string[],
  contributors?: { did: string, role?: string, displayName?: string }[],  // omitted if empty
  updatedAt?: string,                        // ISO 8601

  // SCRIBE EXTENSION — Scribe-specific fields not in the spec
  scribe: {
    domain?: string,                         // domain name e.g. "norobots.blog" — omitted while loose (ADR 0013)
    createdAt: string,                       // ISO 8601 — article creation date
    coverImageUrl?: string,                  // source URL for the cover image
    canonicalUrl?: string,                   // fully-qualified article URL — omitted while loose
  },
}
```

**`app.scribe.site`** — legacy collection, no longer used. All publications are `site.standard.publication`.

**`site.standard.publication`** — a managed website, rkey = TID:

```ts
{
  // SPEC — top-level only
  $type: "site.standard.publication",

  // SCRIBE EXTENSION — all site metadata lives here
  scribe: {
    domain: string,          // e.g. "norobots.blog" — domain name (→ Site.url in SDK)
    basePath: string,        // e.g. "blog" — path prefix (→ Site.urlPrefix in SDK); empty string if none
    title: string,
    description?: string,
    splashImageUrl?: string,
    logoImageUrl?: string,
    groups: Array<{          // named groups (order is significant)
      slug: string,
      title: string,
      articles: ArticleRef[],
    }>,
    ungroupedArticles: ArticleRef[], // in-progress articles not yet in a named group
    createdAt: string,
    updatedAt: string,
  }
}

// ArticleRef — cached snapshot stored inside the publication record:
{
  uri: string,            // full AT URI e.g. at://did/site.standard.document/3mp4hfovqib2h
  title: string,
  slug?: string,          // human-readable article slug (stored field, not rkey)
  splashImageUrl: string | null,
  description?: string | null,
  tags?: string[],
  createdAt: string,
  publishedAt?: string,
  updatedAt?: string,
}
```

Key design decisions for `site.standard.publication`:

- `ownerId` is omitted — the owner is whoever's PDS holds the record (their DID is the repo DID)
- Article refs are objects (not bare AT URIs) with cached metadata to avoid N+1 fetches
- `cid` is deliberately excluded from article refs — fetch live at deletion to avoid stale `swapRecord` failures
- Groups and article order within groups are authoritative — the publication record is the manifest
- `ungroupedArticles` holds in-progress articles not yet assigned to a named group; articles in `groups[].articles` are considered published
- `updatedAt` is useful for cache invalidation by public readers
- **ArticleRef mirroring principle:** every field from the article record except `content` and `textContent` should be mirrored in `ArticleRef`. Large fields are excluded because they defeat the purpose of a cached snapshot. Current mirrored fields: `title`, `slug`, `splashImageUrl`, `description`, `tags`, `createdAt`, `publishedAt`, `updatedAt`. When adding a new article field, also add it to `ArticleRef` in `app/hooks/types.ts` in the same PR, then update the construction/propagation sites: `buildArticleRef` in `app/services/article.server.ts` (called by `create.tsx` and `edit.tsx`), and `nodeFromRef` + `articleRefFromNode` in `siteTree.ts` (the single field-mapping seam between `ArticleRef` and `TreeArticleNode` — `buildTreeFromSite` and `treeToSiteData` delegate all field work to them).
- **ArticleRef keep-alive:** since ADR 0013 an article belongs to at most one publication, ever, and editing never changes *which* one — that's exclusively the Publish/Unpublish actions' job. The edit action (`/article/edit`) only refreshes the cached ArticleRef snapshot in that one publication (via `mutateSiteRecord` + `updateArticleRef`), and only when the document is currently published (`site` is an `at://` URI, not the loose reader URL) — a loose document has no publication to refresh.

The `/site/:siteName/configure` route edits publication metadata (`title`, `description`, `splashImageUrl`, `logoImageUrl`, `domain`, `basePath`) via a `putRecord` on the existing rkey — no rename complexity since the rkey is a TID assigned at creation and stays fixed. Optional fields are omitted from the record entirely when left blank (not stored as empty strings).

The `/article/list` route is the global article list and the sole home of the **Publish** action (ADR 0013 — assignment and publication happen together, atomically, nowhere else). Two sections: **Site-Assigned Articles** (documents referenced in some publication's `groups[].articles`) and **Unassigned Drafts** (everything else — loose documents, `site` is the reader URL). The loader fetches document and publication records in parallel and builds an assignment map from every publication's `groups[].articles` to classify each document. Each Unassigned Draft has a **Publish** button opening a modal: pick a site, then pick an existing group or create a new one inline (`groupSlug` set to a `"__new__"` sentinel reveals a title field; the action calls `createGroup` first, then `publishArticleToGroup` with the resulting slug). On success, if the target site's `notifySubscribersEnabled` preference is on, a "Notify subscribers?" modal offers to DM subscribers via the social service (mirrors the equivalent flow that used to live on `/article/list/:siteSlug`). The route also has a `deleteArticle` action (default intent) for removing Unassigned Drafts directly from the PDS.

The `/article/list/:siteSlug` route is the site-scoped group-management view — it no longer has any Publish UI or site-assignment concept at all; it only manages groups and ordering *within* a site the document is already published to. It reads the site record, builds a DnD tree, and writes the updated site record back. Actions: `createGroup`, `deleteGroup`, `saveSite`, `removeArticle`, `moveToDraft` (despite the name, this now calls `unpublishArticle` — fully detaches the document from the site and resets it back to loose, not a "move within the site" as before ADR 0013). **Remove article only removes it from the site record — it does not delete the PDS article record.**

Key behaviours on this route:

The route's state and DnD logic are extracted into two co-located hooks:

- **`useDirtyTree(site)`** (`useDirtyTree.ts`) — owns `tree`/`savedTree` state, `isDirty` computation, the group-creation sync effect (detects newly persisted groups from the loader and appends them without marking dirty), and `markSaved`/`removeGroup` helpers.
- **`useSiteListDnD(tree, setTree)`** (`useSiteListDnD.ts`) — owns DnD sensors, `activeArticle`/`activeGroup` state, and all three drag handlers (`onDragStart`, `onDragOver`, `onDragEnd`).

Key behaviours:

- **Dirty tracking** — `savedTree` holds the tree as last saved. `isDirty` is computed via `useMemo` using `JSON.stringify` comparison. The Save Order button is disabled until `isDirty` is true.
- **Navigation blocker** — `useBlocker(isDirty)` intercepts any React Router navigation when there are unsaved changes. A modal appears with three options: **Stay** (`blocker.reset()`), **Discard & Leave** (`blocker.proceed()`), **Save & Leave** (triggers save, then calls `blocker.proceed()` from the fetcher effect via `proceedAfterSaveRef`).
- **Save feedback** — success shows a success toast (auto-expires); error shows a danger toast with `autoExpire: false` so it persists until dismissed.
- **Group create** — `createGroup` action returns `{ ok: true }` (not a redirect) so the fetcher can close the modal automatically. The loader revalidates automatically after any fetcher action; `useDirtyTree` detects newly added group slugs and appends them as empty group nodes without registering them as unsaved changes.
- **Group delete** — handled via `deleteFetcher` (not a form redirect). Action returns `{ ok: true, deletedSlug }`; `useDirtyTree.removeGroup(slug)` removes the group from both `tree` and `savedTree` client-side. The `GroupItem` delete button shows `<Spinner size="small" />` while `isDeleting` is true.
- **Add New Group modal** — includes a URL path (slug) field that auto-populates from the title as the user types. Once the user manually edits the slug the auto-fill stops. The slug is immutable after creation (it keys the group in the site record); the modal shows a note to that effect.
- **Unpublish workflow** — every group here is a named, published group (the `g:root`/"Unpublished Articles" node is filtered out of rendering entirely — since ADR 0013 nothing can populate it anymore, so it's structurally always empty). Each article in a named group shows an **Unpublish** button that opens a confirmation modal naming the site and group; submits `_intent=moveToDraft` with `uri`, which calls `unpublishArticle` — removes the ArticleRef from the site manifest entirely and resets the document's `site`/`path`/`scribe` back to the loose shape via `buildLooseDocumentFields`. There is no in-site "Publish" button anymore; publishing a loose article into this site happens from `/article/list`.
- **"Draft New Article" link** — navigates to `/article/create`. Creation always starts loose (no site picker); assigning it to this site is a separate Publish step from `/article/list` afterward.

### Nuke tool

The home page (`/`) contains a developer "Nuke all records" tool. The collections it deletes are defined in `SCRIBE_COLLECTIONS` inside `app/routes/home/home.tsx`:

```ts
const SCRIBE_COLLECTIONS = ["site.standard.document", "site.standard.publication"];
```

When adding a new collection, add it here too so nuke keeps working.

### OAuth scopes

```
atproto
repo:site.standard.document?action=create
repo:site.standard.document?action=update
repo:site.standard.document?action=delete
repo:site.standard.publication?action=create
repo:site.standard.publication?action=update
repo:site.standard.publication?action=delete
```

The scope list has **a single source of truth**: `OAUTH_SCOPE` exported from `app/services/auth.server.ts`. It is _consumed_ in three places — `clientMetadata.scope` (same file), `app/routes/client-metadata.ts`, and `app/routes/login/login.tsx` — but **only needs to be edited in one place**. Adding a new scope: update `OAUTH_SCOPE` only.

**Users must re-authenticate after a scope change** — existing sessions do not gain new scopes. To revoke an existing authorization: go to **https://bsky.social/account** → find the app entry → revoke. Then log in again to get a fresh token with the updated scopes.

### Public read access

AT Protocol repositories are **publicly readable without authentication**. Any consumer can call:

```
GET https://{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection=site.standard.document
GET https://{pds}/xrpc/com.atproto.repo.getRecord?repo={did}&collection=site.standard.document&rkey={tid}
GET https://{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection=site.standard.publication
```

This means a separate read-only frontend (public blog, etc.) can fetch and display articles with no OAuth token.

### Making authenticated AT Protocol calls

Prefer `requireAtpAgent` in route loaders and actions — it combines `requireAuth` + `getAtpAgent` into one call. Pattern:

```ts
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";

// Check dev bypass first (return mock data early), then get agent for the real path:
if (!useRealOAuth) { return mockData; }
const { agent, did, handle } = await requireAtpAgent(request);

await agent.com.atproto.repo.createRecord({ ... });
await agent.com.atproto.repo.putRecord({ ... });
await agent.com.atproto.repo.deleteRecord({ ... });
await agent.com.atproto.repo.listRecords({ ... });
await agent.com.atproto.repo.getRecord({ ... });
```

Use `getAtpAgent(did)` directly only when you already have a `did` from a separate `requireAuth` call (e.g. when the dev-bypass path needs `did` to construct a mock AT URI). Both automatically redirect to `/login` if the session is missing.

## Components

Reusable UI components live in `app/components/`. Each has a co-located CSS module.

| Component                             | Path                                                     | Props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Input`                               | `app/components/Input/Input.tsx`                         | All `<input>` HTML attrs + `label?: string`, `error?: string`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Button`                              | `app/components/Button/Button.tsx`                       | All `<button>` HTML attrs + `variant?: "primary" \| "secondary" \| "danger" \| "success"` (default `"primary"`) + `icon?: SvgImageListTypes` — when provided, renders the icon in a 1.6rem `inline-flex` span to the left of the label using `fill="currentColor"` so it inherits the button's text colour across all variants. **`type` defaults to `"button"`** — prevents accidental form submission when a `<Button>` sits inside a `<Form>` without an explicit type. Pass `type="submit"` explicitly for submit buttons.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `IconBadge`                           | `app/components/IconBadge/IconBadge.tsx`                 | Circular blue badge containing an SVG icon. Props: `icon: SvgImageListTypes`, `size?: "small" \| "large"` (default `"small"`). Small = 3rem × 3rem, large = 6rem × 6rem (matches `headingIconContainer` in `PageContainer`). Use for inline row decoration; `PageContainerHeading` uses equivalent inline styles directly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `RichTextEditor`                      | `app/components/RichTextEditor/RichTextEditor.tsx`       | `name: string`, `label?: string`, `defaultValue?: string` — drop-in for `<textarea>`, outputs HTML into a hidden field on form submit. Client-only (falls back to plain textarea during SSR). Toolbar implemented in `EditorToolbar.tsx` (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ImagePickerModal`                    | `app/components/ImagePickerModal/ImagePickerModal.tsx`   | Modal for browsing the Image Library and selecting an image to insert into the editor. Props: `isOpen: boolean`, `onClose: () => void`, `onPick: (src: string, altText: string, sources?: ImageSource[]) => void`. Renders a folder-tree breadcrumb nav, subfolder grid, and image grid. Fetches browse data from the Image Service via `browseFolders()` from `imageServiceClient.ts`. Each image tile offers per-Variant insert buttons (Thumb, 600, 1200, 1800, Max) with a split-button dropdown for size selection; clicking a size calls `handlePick` which **absolutizes the URL with `window.location.origin`** before passing it to `onPick`, and passes `""` as the alt text. Absolute URLs are mandatory because article HTML is consumed by external sites — a relative path would resolve against the consumer's domain, not the image host. Empty alt text is intentional: a filename is worse than empty from a screen reader perspective; empty is a valid decorative-image declaration and prompts the author to add meaningful alt text via the Alt text button. `handlePick` also passes `sources` — every Variant present in the image's `sizes` map (including the picked one and `thumb`), absolutized the same way — so the editor can emit a `srcset` alongside `src` (ADR 0029). The toolbar's Image button (SVG icon — `SvgImageList.Image`) mounts this modal and dispatches `INSERT_IMAGE_COMMAND` on selection. Shared browser types (`BrowseFolder`, `BrowseImage`, `BrowseResponse`, `ImageSource`, `VARIANT_ORDER`, `VARIANT_LABEL`, `variantUrl`, `thumbUrl`) live in `app/components/ImagePickerModal/imageBrowserTypes.ts` and are imported by both the modal and the Image Library (`/images`) route to avoid duplication.                                             |
| `ImageResizeDecorator`                | `app/components/RichTextEditor/ImageResizeDecorator.tsx` | Rendered by `ImageNode.decorate()` — wraps each inserted image with resize handles and alt text editing. Left and right drag handles appear on hover or when the Lexical node is selected (`useLexicalNodeSelection`). Drag is local React state (`dragWidth`); a single `editor.update()` on mouseup commits the final width via `node.setWidth()`. Minimum: 80px. A pixel badge (`"NNNpx"`) overlays the image during an active drag. Clicking the image sets Lexical selection; clicking outside deselects. A **Reset size** button appears on hover/select when the image has a stored width (`width !== null`) and calls `node.setWidth(null)` to remove the constraint. An **Alt text** button (bottom-left, same pill style as Reset size) also appears on hover/select and opens a `<Modal>` with a `<Textarea>` pre-filled with the current `altText`; the Save button is disabled until the value changes; `editor.update(fn, { discrete: true })` commits synchronously via `node.setAltText()`. A module-level `const openModals = new Set<NodeKey>()` tracks which modals are open so that state survives decorator remounts (which reset `useState`). `commitPendingRef = useRef(false)` is set on mouseup and cleared by a catch-up `useEffect` that fires once Lexical confirms the new width in props — this guards against the effect incorrectly clearing `dragWidth` during a drag where start and end widths happen to be equal (see Lexical v0.44 compatibility notes below). CSS: `ImageResizeDecorator.module.css`. |
| `Modal`                               | `app/components/Modal/Modal.tsx`                         | `isOpen: boolean`, `onClose: () => void`, `title: string`, `footer?: ReactNode`, `children: ReactNode` — renders a native `<dialog>` element opened via `dialog.showModal()`. Uses `aria-labelledby` wired to a `useId`-generated title id. Closes on Escape key (via `keydown` listener) and on backdrop click (click target === dialog element). Clicking inside the modal content does not close it. `onCancel` is suppressed to prevent the browser's native Escape close from bypassing the listener. **`line-height` reset:** `.dialog` in `Modal.module.css` sets `line-height: 1.5` explicitly — even though `showModal()` promotes the dialog to the top layer visually, CSS inheritance still flows from DOM ancestors, so a parent with `line-height: 0` (e.g. `ImageResizeDecorator`'s `.wrapper`) would collapse button text and textarea height without this reset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `useModal`                            | `app/components/Modal/useModal.ts`                       | Hook returning `{ isOpen, open, close }` — use alongside `Modal` to manage open state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `PageContainerHeading`                | `app/components/PageContainer/PageContainer.tsx`         | Styled page heading with an icon badge. Props: `icon: SvgImageListTypes`, `children: ReactNode`. Renders a circular blue badge containing the icon alongside an `<h1>`. Pass as the `title` prop of `PageContainer` — every app route does this: `<PageContainer title={<PageContainerHeading icon={SvgImageList.Document}>Create Article</PageContainerHeading>}>`. Exported from the same file as `PageContainer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PageContainer`                       | `app/components/PageContainer/PageContainer.tsx`         | Page-level layout wrapper. Props: `children`, `title?: ReactNode` (string renders as `<h1>`), `topButtons?: ReactNode`, `bottomButtons?: ReactNode`, `fixed?: boolean`. `bottomButtons` children are spaced with `gap: 1rem`. When `fixed` is true, the container uses `position: absolute; inset: 2rem` inside `<main>` (which is `position: relative`) so it naturally adapts to the aside width — no hardcoded viewport offsets. Use this for routes that need a full-height scrollable content area. Also exports the following from the same file: `PageSection`, `PageSectionColumns`, `PageSectionColumn`, `PageSectionCell`, `ButtonGroupContainer`, and `PageContainerHeading`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `PageSection`                         | `app/components/PageContainer/PageContainer.tsx`         | Content-dividing wrapper with a `border-top` and `1rem 2rem` padding. Props: `children`, `overflow?: boolean`, `fill?: boolean`. `overflow` — fills the remaining `1fr` content row (`flex: 1`) and scrolls vertically; use for routes where the whole content area scrolls as one. `fill` — fills the remaining `1fr` content row without scrolling; use when child `PageSectionColumn` components handle their own overflow. `overflow` and `fill` are mutually exclusive — do not combine them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `PageSectionColumns`                  | `app/components/PageContainer/PageContainer.tsx`         | 12-column CSS grid wrapper, used as a child of `PageSection fill`. Props: `children`, `breakpoint?: "sm" \| "md" \| "lg" \| "xl" \| "2xl"` (default `"md"`). Below the breakpoint the grid collapses to a single column and all children stack vertically. Breakpoint pixel values: `sm`=640, `md`=768, `lg`=1024, `xl`=1280, `2xl`=1536. Gap is fixed at `2rem`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `PageSectionColumn`                   | `app/components/PageContainer/PageContainer.tsx`         | A single column cell inside `PageSectionColumns`. Props: `children`, `span: number` (1–12 — number of grid columns to occupy, applied as `gridColumn: span N`), `overflow?: boolean` (fills available column height and scrolls vertically — same behaviour as `PageSection overflow` but scoped to the column). Use `overflow` when the column content may exceed the viewport height (e.g. a long form or a rich text editor). Canonical two-column pattern for a fixed-layout route: `<PageSection fill><PageSectionColumns breakpoint="lg"><PageSectionColumn span={4} overflow>…</PageSectionColumn><PageSectionColumn span={8} overflow>…</PageSectionColumn></PageSectionColumns></PageSection>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ArticleForm`                         | `app/components/ArticleForm/ArticleForm.tsx`             | Shared form fields for article create and edit. Props: `defaultTitle?`, `defaultUrl?`, `defaultSplashImageUrl?`, `defaultContent?`, `error?: string`. No site-assignment UI at all (ADR 0013) — that's exclusively the Publish/Unpublish actions' job on `/article/list` and `/article/list/:siteSlug`. Renders Title, URL slug, Splash image URL, and RichTextEditor inside `PageSection` wrappers. Re-exports `SiteOption` from `~/components/types` for other consumers. Hidden fields (`cid`), the submit button, and `FooterPortal` stay in the individual route components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Pill`                                | `app/components/Pill/Pill.tsx`                           | Inline label badge. Props: `children`, `variant?: "default" \| "primary" \| "secondary" \| "danger" \| "success"` (default `"default"`). Used for count badges and status labels. CSS: `Pill.module.css`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `TextArrayInput`                      | `app/components/TextArrayInput/TextArrayInput.tsx`       | Controlled input for managing an array of string values. Props: `name: string`, `label?: string`, `values: string[]`, `onChange: (values: string[]) => void`. Renders each value as a removable chip with a text input for adding new entries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ArticleList`                         | `app/components/ArticleList/ArticleList.tsx`             | `<ul>` wrapper for a list of `ArticleItem` components. Props: `children`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ArticleItem`                         | `app/components/ArticleItem/ArticleItem.tsx`             | Individual article row. Props: `id`, `uri`, `title`, `createdAt`, `cid?`, `mode?: "pds" \| "site" \| "site-unpublished" \| "site-published"`. Additional props: `groupTitle?`, `siteName?`, `onPublishClick?: (uri: string) => void`. `id` is the dnd-kit sortable id (`a:{slug}`). In `"pds"` mode (default): Delete button removes the record from the PDS. In `"site"` mode: Remove button removes the article from the site record only (`_intent=removeArticle, uri`). Also exports `ArticleItemPreview` (hook-free version for use inside `DragOverlay`) — renders the drag handle, `IconBadge`, title, and date only; no action buttons and no URI display. `uri` is kept in the preview's prop interface so call sites in `site-list.tsx` need no change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GroupList`                           | `app/components/GroupList/GroupList.tsx`                 | `<ul>` wrapper for a list of `GroupItem` components. Props: `children`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GroupItem`                           | `app/components/GroupItem/GroupItem.tsx`                 | Individual group row. Props: `id`, `uri?`, `cid?`, `title`, `slug`, `articleChildren: TreeArticle[]`, `isRoot?: boolean`, `articleMode?: "pds" \| "site" \| "site-unpublished" \| "site-published"`, `urlAndPrefix?`, `siteName?`, `onPublishClick?: (uri: string) => void`, `onDeleteConfirm?: (slug: string) => void`, `isDeleting?: boolean`. Also exports `GroupItemPreview` (hook-free, for `DragOverlay`, `uri?` optional) and re-exports `TreeArticle` from `~/components/types`. `id` is the dnd-kit sortable id (`g:{slug}`). When `isRoot` is true, renders the `title` prop as the heading with no drag handle or delete button. Named groups include a Delete Group button (disabled when group has articles). When `onDeleteConfirm` is provided, confirmation calls it instead of submitting the form natively — this is the correct path for fetcher-based deletes. `isDeleting` replaces the trash icon with `<Spinner size="small" />` and disables the button. `articleMode` is forwarded to each `ArticleItem` child.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Select`                              | `app/components/Select/Select.tsx`                       | Select input. Exports `SelectOption` interface `{ value: string; label: string }`. Single-select mode: props `name`, `options`, `label?`, `error?`, `id?`, `value?: string`, `onChange?: (value: string) => void` — renders a `<select>` element. Multi-select mode: add `multiple` prop; `value` becomes `string[]`, `onChange` becomes `(value: string[]) => void` — renders a dropdown trigger styled like `<select>` that opens a checkbox list on click; collapses showing "Select options" / single label / "{n} selected" summary; closes on click-outside or Escape. Both modes post standard form values under `name` (multi-select uses hidden inputs per selected value).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AsideMenu`                           | `app/components/AsideMenu/AsideMenu.tsx`                 | Navigation sidebar — dashboard, sites (`/sites`), groups (`/groups`), articles (`/article/list` — navigate from there into a site's article management), create article, logout. Props: `expanded: boolean`, `onToggle: () => void`. State is owned by `core.tsx` and persisted in `localStorage`. In collapsed mode (6rem wide) each nav item shows only its icon with a `Tooltip` on hover; in expanded mode (20rem wide) a label span fades in alongside the icon. Icons are `position: absolute; left: 0.8rem` inside `position: relative` nav links so they never move during transition. Nav items are driven by a `MENU_CONFIG` array; add entries there to extend the menu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SvgIcon`                             | `app/components/SvgIcon/SvgIcon.tsx`                     | Renders SVG icons. Props: `name: SvgImageList` (enum), `className?`, `stroke?`, `strokeWidth?`, `fill?`, `background?`, `text?`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Tooltip` / `TooltipBubble`           | `app/components/Tooltip/Tooltip.tsx`                     | CSS-anchor-based tooltip. `Tooltip` props: `children`, `anchorName`, `anchorContent`, `anchorPosition`, `zIndex?`. `TooltipBubble` accepts a `variant?: "primary" \| "secondary" \| "danger" \| "success"` prop — all four variants share the same API as `Button`, `Pill`, and `Toast`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SiteTile`                            | `app/components/SiteTile/SiteTile.tsx`                   | Card tile for a single site. Props: `site: SiteCard`, `onDelete?: (site: SiteCard) => void`, `isDeleting?: boolean`. Renders splash image (or gradient placeholder), logo, title, description, composed URL, and Manage / Configure / Delete actions. When `site.isContributor` is set, shows a "Contributor" `Pill` next to the title and hides Configure/Delete regardless of whether `onDelete` was passed — Manage still renders (a Contributor's only route into `/article/list/:siteSlug`). Re-exports `SiteCard` from `~/components/types`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SiteListItem`                        | `app/components/SiteListItem/SiteListItem.tsx`           | Horizontal list-row card for a single site. Props: `site: SiteCard`, `onDelete?: (site: SiteCard) => void`, `isDeleting?: boolean`. Renders a splash thumbnail with gradient right-edge fade, an overlapping circular logo, site title, composed URL, group/article count badges, and Manage Articles / Configure / Delete actions. `onDelete` is optional — omit it on pages that don't support deletion (e.g. `/article/list`). Same `isContributor` gating as `SiteTile` (Pill shown, Configure/Delete hidden, Manage Articles stays). Re-exports `SiteCard` from `~/components/types`. Used alongside `SiteTile` on `/sites` — both lists are always rendered and toggled with `display: none` so background images stay in memory across view switches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `FooterPortal`                        | `app/components/FooterPortal/FooterPortal.tsx`           | Portals `children` into `<footer id="footer-portal-element">` in the core layout. Default export. Props: `children: ReactNode`. Client-only — uses a `mounted` guard (same pattern as `RichTextEditor`) to avoid SSR crashes from `document.getElementById`. **Note:** portaled buttons must use `form="form-id"` to associate with a `<form>` elsewhere in the DOM — they are no longer DOM descendants of the form. For navigation (non-form) footer actions, wrap `<Button>` in `<Link>` — add `tabIndex={-1}` to the inner `<Button>` (see accessibility conventions below) and `core.module.css` handles spacing for the `footer > a > button` selector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Spinner`                             | `app/components/Spinner/Spinner.tsx`                     | Spinning ring indicator. Props: `overlay?: boolean`, `size?: "small" \| "medium" \| "large"` (default `"medium"`). Without `overlay`: renders the ring inline. With `overlay`: wraps the ring in a `position: fixed; inset: 0` full-viewport overlay that dims everything behind it. Used in `core.tsx` as `<Spinner overlay />` during route navigations. Use `size="large"` in `HydrateFallback` exports; use `size="small"` for inline button states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Toast` / `ToastContainer` / `Toasts` | `app/components/Toast/Toast.tsx`                         | `Toast` renders a single notification with a slide-in-from-right mount animation and a slide-out dismiss animation. Props: all fields from `ToastPropsWithId` (see ToastContext). Auto-dismisses via `useEffect` + `setTimeout` when `autoExpire` is true. Cleanup cancels the timer if the toast is removed manually first. `ToastContainer` wraps toasts with `overflow: hidden` to prevent scrollbar jank during transitions. `Toasts` reads all active toasts from context via `useToast()` and renders them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ToastProvider` / `useToast`          | `app/components/Toast/ToastContext.tsx`                  | Context provider wired into `core.tsx` — wraps the entire layout so `useToast()` works anywhere in the app. `useToast()` returns `{ toasts, addToast, removeToast }`. `addToast(props: ToastProps)` generates a UUID, binds `removeToast`, and appends to state. `removeToast` is `useCallback`-memoized with `[]` deps so its reference is stable — without this, adding a new toast would reset all existing timers. Exports: `ToastProvider`, `useToast`, `ToastProps`, `ToastPropsWithId`. `ToastProps`: `heading`, `content?`, `autoExpire?` (default `true`), `expireTimeSeconds?` (default `5`), `variant?: "primary" \| "secondary" \| "danger" \| "success"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `DarkModeSwitch`                      | `app/components/DarkModeSwitch/DarkModeSwitch.tsx`       | Toggle switch in the header for light/dark mode. Props: `darkMode: boolean`, `toggleDarkMode: () => void`. Renders a `<button>` (not `<div>`) with `aria-label="Switch to light/dark mode"` containing a sun + moon icon pair with a sliding indicator; CSS classes `lightMode` / `darkMode` drive the indicator position. Wired to `useTheme()` inside `core.tsx` — `toggleDarkMode={toggleTheme}`, `darkMode={theme === "dark"}`. Does not own any state itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Accessibility conventions

**`<Link><Button>` double tab stop:** `<Link><Button>` renders `<a><button>` — two focusable elements, two tab stops. Fix: add `tabIndex={-1}` to every `<Button>` nested inside a `<Link>`. The `<Link>` (`<a>`) is the single tab stop; `tabIndex={-1}` removes the button from the tab order while keeping it in the DOM and accessible to screen readers via the parent link.

```tsx
<Link to="/some/path">
  <Button type="button" variant="primary" tabIndex={-1}>
    Label
  </Button>
</Link>
```

**Input label association:** every `<Input>` that renders a `<label>` must receive an `id` prop matching its `name`. Without a matching `id`, `htmlFor` has no element to point at and the label is not programmatically associated (WCAG 2.1 AA failure). Pattern:

```tsx
<Input id="title" name="title" label="Title" ... />
```

### RichTextEditor — toolbar

The toolbar lives in `app/components/RichTextEditor/EditorToolbar.tsx` and is rendered inside `RichTextEditor.tsx`. Features, left to right:

| Section       | Controls                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History       | Undo, Redo                                                                                                                                                       |
| Block type    | Dropdown: Normal, H1–H6, Bullet List, Numbered List, Check List, Quote, Code Block                                                                               |
| Font          | Family `<select>` (Arial / Courier New / Georgia / Times New Roman / Trebuchet MS / Verdana)                                                                     |
| Font size     | Number input + − / + step buttons                                                                                                                                |
| Inline format | **Bold**, _Italic_, Underline                                                                                                                                    |
| Code / Link   | Inline code `</>`, Link 🔗 (shows URL input inline when inserting), Image (SVG icon — opens `ImagePickerModal` to browse the Image Library and insert at cursor) |
| Colour        | Text colour swatch (native colour picker), Background colour swatch                                                                                              |
| Format ▾      | Strikethrough, Subscript, Superscript, Highlight, Lowercase, Uppercase, Capitalise, Clear formatting                                                             |
| Align ▾       | Left, Center, Right, Justify, Start, End, Outdent, Indent                                                                                                        |
| Speech        | 🎤 Speech-to-text via Web Speech API (browser-dependent; inserts recognised text at cursor)                                                                      |
| Shortcuts     | `?` button opens a modal listing all keyboard shortcuts                                                                                                          |

Toolbar buttons use `onMouseDown + e.preventDefault()` (not `onClick`) to avoid stealing editor focus.

**Keyboard shortcuts** — handled by a `KEY_DOWN_COMMAND` registered in a separate `useEffect` (with `[editor, isLink]` deps so `insertLink()` always closes over the current `isLink` state). Uses `event.code` (physical key position) for digit matching so shortcuts work regardless of keyboard layout:

| Shortcut            | Action                    | Notes                                                                        |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `Ctrl+Shift+\``     | Normal paragraph          | Backtick key — avoids Windows OS-reserved `Ctrl+Shift+0`                     |
| `Ctrl+Shift+1–6`    | Heading 1–6               | Some may be intercepted by Windows language switcher on multi-layout systems |
| `Ctrl+Shift+7`      | Numbered list             |                                                                              |
| `Ctrl+Shift+8`      | Bullet list               |                                                                              |
| `Ctrl+Shift+9`      | Blockquote                |                                                                              |
| `Ctrl+Shift+S`      | Strikethrough             |                                                                              |
| `Ctrl+\``           | Inline code               |                                                                              |
| `Ctrl+\`            | Clear formatting          |                                                                              |
| `Ctrl+K`            | Insert / edit link        | Opens the inline URL input; auto-focuses it on mount                         |
| `Ctrl+B/I/U`        | Bold / Italic / Underline | Handled natively by Lexical                                                  |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo               | Handled natively by Lexical                                                  |

**Why `Ctrl+Alt` was not used:** on Windows, `Ctrl+Alt` is equivalent to AltGr. AltGr characters are composed and inserted via the `beforeinput` event — `keydown.preventDefault()` does not suppress them. `Ctrl+Shift+0` was also dropped: it is intercepted by the Windows input method manager regardless of keyboard layout.

**Discoverability** — toolbar button `title` attributes include the shortcut hint (e.g. `"Bold (Ctrl+B)"`). Dropdown items (`DropdownItem`) accept an optional `shortcut?: string` prop that renders muted monospace text on the right side of the item. The `?` button opens a modal with a full shortcuts reference table.

All theme classes for Lexical nodes (headings, lists, code highlight tokens, links, text formats) are defined in `RichTextEditor.module.css` and wired into the `theme` object in `RichTextEditor.tsx`.

### RichTextEditor — Lexical v0.44 compatibility notes

- **`$setBlocksType`** is not exported by `@lexical/utils` in v0.44. It is implemented locally in `EditorToolbar.tsx`. If upgrading Lexical, check whether it becomes available in `@lexical/utils` and remove the local copy.
- **`LexicalCodeHighlightPlugin`** does not exist as a named export from `@lexical/react` in v0.44. Code syntax highlighting is registered via `registerCodeHighlighting(editor)` from `@lexical/code` inside a `useEffect` in a small `CodeHighlightPlugin` wrapper defined inline in `RichTextEditor.tsx`. `registerCodeHighlighting` is marked deprecated upstream but is the correct v0.44 approach.
- **Web Speech API** (`SpeechRecognition`, `SpeechRecognitionEvent`) has no TypeScript lib types. Local interface declarations are provided at the top of `EditorToolbar.tsx` — do not add `@types/dom-speech-recognition` unless TS starts complaining about conflicts.
- **Inline style persistence — `ExtendedTextNode`** (`app/components/RichTextEditor/ExtendedTextNode.ts`): Lexical's default `TextNode.importDOM()` span converter only reads `font-weight`, `font-style`, and `text-decoration` — it silently drops `color`, `background-color`, `font-family`, and `font-size`. `ExtendedTextNode` extends `TextNode` and registers a priority-1 span converter that chains the original (for bold/italic flags) and additionally applies the CSS-only properties via `setStyle()`. It is registered in `EDITOR_NODES` in `RichTextEditor.tsx` but is never instantiated during normal editing — its sole purpose is to supply the higher-priority converter to Lexical's import registry.
- **Image insertion — `imageNode.tsx`** (`app/components/RichTextEditor/imageNode.tsx`): `ImageNode extends DecoratorNode` with `INSERT_IMAGE_COMMAND`. Stores `__src`, `__altText`, `__width: number | null`, and `__sources: ImageSource[] | null` (ADR 0029). `importDOM` reads width from the inline style first, then the `width` HTML attribute, then null; it also parses a `srcset` attribute (if present) straight into `__sources` — `srcset`'s own `"url Nw"` pairs are self-describing, so no extra `data-*` attribute is needed to round-trip it. `exportDOM` emits `style="width: Npx; max-width: 100%;"` when width is set, and additionally emits `srcset`/`sizes` when `__sources.length > 1` (a single candidate is omitted — nothing for the browser to choose between). `sizes` is `${width}px` when the author has manually resized the image, else a generic default (`(max-width: 768px) 100vw, 700px`) since consumer sites don't share one fixed content-column width. `exportJSON`/`importJSON` include `width` and `sources` for Lexical clipboard round-trips (both backwards-compatible — absent fields default to null). `decorate()` returns `<ImageResizeDecorator>` — `srcset` is a published-HTML-only concern, the live editor canvas keeps rendering `__src` only. Registered in `EDITOR_NODES`. The toolbar's Image button (SVG icon) opens `ImagePickerModal`; on selection it dispatches `INSERT_IMAGE_COMMAND` with `{ src, altText, sources }` — every image insertion transparently gets a `srcset` now, with no author-facing toggle or mode (ADR 0029 explicitly rejected that in favor of this always-on approach). `setAltText(altText: string)` updates `__altText` via `getWritable()` — called by `ImageResizeDecorator`'s Save handler.
- **Image resize — `ImageResizeDecorator.tsx`** (`app/components/RichTextEditor/ImageResizeDecorator.tsx`): The decorator rendered by `ImageNode.decorate()`. Manages all resize UI: left and right drag handles (visible on hover or when the Lexical node is selected via `useLexicalNodeSelection`), a pixel-width badge shown during an active drag, a **Reset size** button (appears on hover/select when `width !== null`, calls `node.setWidth(null)`), and the commit logic. Drag state is local React state (`dragWidth: number | null`); on mouseup a single `editor.update()` call commits the final width to the node via `node.setWidth()`. Minimum width: 80px. `getBoundingClientRect().width` is used to determine the start width on drag start, falling back to the node's stored `width` (then 300) because jsdom returns 0 — the `||` operator is used intentionally here rather than `??`. The click-outside handler does not depend on `isSelected` so it is not re-attached on every Lexical selection change. **`commitPendingRef` flash fix:** A `commitPendingRef = useRef(false)` boolean guards the post-mouseup/pre-Lexical-commit window. The problem: after mouseup, Lexical's async `editor.update()` call commits the new width, then re-renders the decorator with the updated `width` prop. A catch-up `useEffect` watches for `width === dragWidth` (meaning Lexical has confirmed the value) and clears `dragWidth` to remove the drag overlay. Without `commitPendingRef`, this `useEffect` also fires at drag _start_ whenever the user clicks the handle at the image's current natural width — `dragWidth` and `width` happen to be equal, so the drag overlay is immediately cleared. The fix: `commitPendingRef.current = true` is set on mouseup (before `editor.update()`); the catch-up `useEffect` only clears `dragWidth` when `commitPendingRef.current` is true, then sets it back to false. This way the guard only activates in the genuine post-commit path, not at drag start.
- **Alt text editing on images — implemented via modal (June 2026):** An `"Alt text"` button on the image opens a `<Modal>` (`showModal()`) containing a `<Textarea>`. The modal approach was chosen specifically to avoid five interlocking failure modes that made an inline `<input>` unworkable — see `docs/adr/0007-image-alt-text-modal-not-inline.md`. Key implementation details:
  1. **`showModal()` focus trap** — keyboard events inside the `<dialog>` top layer do not reach the contenteditable's Lexical native listeners. No native event interception needed.
  2. **`isModalOpen` is independent of Lexical selection** — modal visibility is not driven by `isSelected`; it is separate state that is not cleared when Lexical blurs the contenteditable.
  3. **Module-level `Set<NodeKey> openModals`** — `useState` resets on decorator remount; the module-level set persists across remounts. `isModalOpen` is initialised as `() => openModals.has(nodeKey)` so a remounted decorator reopens in the same state it was in.
  4. **`editor.update(fn, { discrete: true })`** — synchronous commit on Save prevents the async race where form submission reads the `content` field before the node update has processed.
  5. **`editor.update` in the Save handler** — changing the node's `__altText` via `node.setAltText()` changes the exported HTML, which `HiddenFieldPlugin` catches via `registerUpdateListener`, marking the article dirty and enabling the article Save button.
- **Historical note — inline alt text input (abandoned, June 2026):** Before the modal approach, an inline `<input>` inside `ImageResizeDecorator` was attempted. The five failure modes above each have straightforward individual fixes, but they all had to hold simultaneously — the combination was too fragile to ship. See ADR 0007 for the full analysis.
- **Dirty-state detection in `HiddenFieldPlugin`**: This plugin has gone through several iterations — the current implementation is load-bearing; do not simplify it without understanding all three constraints it satisfies simultaneously.
  - **Why not `OnChangePlugin`**: `OnChangePlugin` has a built-in `prevEditorState.isEmpty()` guard that skips the very first meaningful update (the one produced by `InitialValuePlugin` loading existing article content). This caused two bugs: (1) `Reset size` on an image (which triggers an `editor.update()`) did not set dirty state on the article; (2) stats showed 0 on page load for existing articles.
  - **Why not bare `registerUpdateListener`**: Replacing `OnChangePlugin` with `editor.registerUpdateListener` (no guards) fixes the Reset size and stats bugs, but causes `/article/create` to be immediately marked dirty before the user types anything — Lexical fires a transition from its initial truly-empty state to an empty-paragraph state as soon as the editor mounts, which the listener catches and treats as a user edit.
  - **Current implementation**: Uses `editor.registerUpdateListener` with two guards:
    1. `if (prevEditorState.isEmpty()) return;` — blocks the initial mount transition on `/article/create` (empty editor; `prevEditorState._nodeMap.size === 1 && _selection === null`). On the edit page, `InitialValuePlugin` is also skipped by this guard — but that is intentional: `lastHtmlRef` is pre-seeded with the loaded content, so no subsequent update can falsely trigger `onChange`.
    2. HTML equality check: `if (newHtml !== lastHtmlRef.current)` — selection-only Lexical updates produce identical HTML and are silently skipped; actual content and formatting changes differ and propagate.
  - **`lastHtmlRef` initialisation is critical**: The ref is initialised to `defaultValue` (the loaded content), NOT `""`. Without this, the `prevEditorState.isEmpty()` guard on the edit page skips `InitialValuePlugin`, leaving `lastHtmlRef.current = ""`. Any subsequent Lexical plugin update then produces the loaded content HTML → it differs from `""` → `onChange` fires → edit page is immediately marked dirty before the user touches anything. Seeding with `defaultValue` means the first real content update (after `InitialValuePlugin` runs) produces the same HTML as `lastHtmlRef`, swallows it, and never fires `onChange`.
- **Dirty-state in route components**: Lexical's `contenteditable` never fires native form `input` events, so typing in the editor does not trigger the form's `onInput` handler. Both `create.tsx` and `edit.tsx` route the editor's `onChange` prop through a `handleContentChange` function that calls `setIsDirty(true)`. In `edit.tsx` there is no longer a `contentInitializedRef` guard — the `HiddenFieldPlugin` guards (`prevEditorState.isEmpty()` + `lastHtmlRef = defaultValue`) prevent init-phase calls from reaching `handleContentChange` at all, so any call that does reach it is a genuine user edit.
- **`StatsPlugin` — uses `registerUpdateListener` directly (not `OnChangePlugin`)**: `OnChangePlugin`'s `prevEditorState.isEmpty()` guard would skip the `InitialValuePlugin` content load, causing word/char counts to show 0 until the user made the first edit. `StatsPlugin` registers directly via `editor.registerUpdateListener` with only the `dirtyElements.size === 0 && dirtyLeaves.size === 0` guard (skips pure selection changes). Unlike `HiddenFieldPlugin`, `StatsPlugin` does not need the `isEmpty` guard — zero stats on a genuinely empty editor is correct, and the `dirtyElements`/`dirtyLeaves` check is sufficient to prevent thrashing on cursor moves. The `StatsPlugin.test.tsx` mock uses `useLexicalComposerContext` (from `@lexical/react/LexicalComposerContext`) — not a now-unused `OnChangePlugin` mock — so if you revert the implementation, the test mock must also be reverted.

## Theming

The app has full light/dark mode support. The active theme is driven by a `data-theme` attribute on `<html>` and toggled via the `DarkModeSwitch` in the header.

### CSS token architecture

Two files in `app/styles/` form the token system:

- **`colours.css`** — palette-only. Raw named colour values, no semantics. Imported by `root.tsx`.
- **`tokens.css`** — semantic design tokens. Maps palette colours to purpose-named variables and defines a `[data-theme="dark"]` override block. Also imported by `root.tsx` (after `colours.css`).

All component CSS modules reference semantic tokens (`var(--surface-page)`, `var(--text-primary)`, etc.) — **never hardcode palette colours in component CSS**. The palette names (`--mine-shaft`, `--white`, etc.) belong only in `tokens.css`.

**Semantic tokens (light defaults, dark overrides):**

| Token              | Light value     | Dark value     | Purpose                              |
| ------------------ | --------------- | -------------- | ------------------------------------ |
| `--surface-page`   | `--white`       | `--charcoal`   | Main content area background         |
| `--surface-header` | `--white`       | `--mine-shaft` | Header bar background                |
| `--surface-input`  | `--white`       | `--charcoal`   | Input / textarea / select background |
| `--surface-app`    | `--mine-shaft`  | _(unchanged)_  | Outer app shell — always dark        |
| `--surface-aside`  | `--blue-ribbon` | _(unchanged)_  | Aside/sidebar — always blue          |
| `--text-primary`   | `--mine-shaft`  | `--white`      | Body and heading text                |
| `--text-secondary` | `--gray`        | `--silver`     | Labels, metadata, muted text         |
| `--text-on-dark`   | `--white`       | _(unchanged)_  | Text on dark or coloured backgrounds |
| `--text-on-aside`  | `--white`       | _(unchanged)_  | Text inside the blue aside           |
| `--border-color`   | `--alto`        | `--dorado`     | Primary borders                      |
| `--border-subtle`  | `--silver`      | `--dorado`     | Lighter / inner borders              |
| `--action-primary` | `--blue-ribbon` | _(unchanged)_  | Button / link primary action colour  |
| `--action-danger`  | `--cinnabar`    | _(unchanged)_  | Destructive action colour            |

**Compat aliases** — backward-compatible names mapped to semantic tokens so old code keeps working without immediate migration:

`--black → --mine-shaft`, `--mid-grey → --gray/--silver`, `--off-white → --wild-sand/--dorado`, `--light-grey → --alto/--dorado`, `--dark-grey → --dorado/--silver`, `--border → --alto/--dorado`, `--red → --cinnabar`, `--error → --cinnabar`, `--blue → --blue-ribbon`.

`--black` intentionally does **not** flip in dark mode — the `--surface-app` shell is always dark and uses `--mine-shaft` directly.

### Flash prevention (three-layer)

1. **SSR sets `data-theme`** from the `theme` cookie in `root.tsx` → `Layout` via `useRouteLoaderData("root")`. No flash for returning users.
2. **Inline `<script>` in `<head>`** in `root.tsx` fires synchronously before paint on first-ever visit: reads `prefers-color-scheme` and sets `data-theme` without waiting for React.
3. **`ThemeProvider` `useEffect`** writes the `theme` cookie on first hydration so subsequent SSR loads skip the inline script path.

### Theme infrastructure

**`app/services/theme.server.ts`** (server-only):

| Export                        | Purpose                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `Theme`                       | `"light" \| "dark"` — canonical type, imported by `ThemeContext.tsx`           |
| `getTheme(request)`           | Reads the unsigned `theme` cookie from the request — returns `"light"` default |
| `serializeThemeCookie(theme)` | Returns a Set-Cookie string (`Path=/; Max-Age=31536000; SameSite=Lax`)         |

The `theme` cookie is **unsigned** (unlike `__session`) — its value is not sensitive and is read server-side only for SSR theming. Max-age 1 year.

**`app/context/ThemeContext.tsx`**:

| Export          | Purpose                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThemeProvider` | Props: `children`, `initialTheme: Theme`. Manages theme state, resolves `prefers-color-scheme` on mount, writes cookie. Wrap `CoreLayoutInner` with this. |
| `useTheme()`    | Returns `{ theme: Theme, toggleTheme: () => void }`. Throws if called outside `ThemeProvider`.                                                            |

`toggleTheme` (from `useCallback`) updates state, sets `document.documentElement.setAttribute("data-theme", next)`, and writes the cookie — all client-side with no server round-trip.

**`app/layout/core/core.tsx`** usage:

```tsx
export default function CoreLayout(props: Route.ComponentProps) {
  return (
    <ThemeProvider initialTheme={props.loaderData.theme}>
      <CoreLayoutInner {...props} />
    </ThemeProvider>
  );
}
// Inside CoreLayoutInner:
const { theme, toggleTheme } = useTheme();
<DarkModeSwitch toggleDarkMode={toggleTheme} darkMode={theme === "dark"} />;
```

### When adding a new component

Use semantic tokens exclusively in CSS modules. Do not use raw palette names or `var(--black)` / `var(--white)` in component styles unless the element is **always on a coloured or dark background** (e.g. the blue aside, Pill text, Toast text on coloured variants, Tooltip text) — in those contexts `var(--white)` is intentionally stable.

## Shared constants

`app/constants.ts` is the single source of truth for string literals and regexes that appear in multiple route files. Import from here rather than redeclaring locally:

| Export                  | Value                                           | Used in                                                         |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `DOCUMENT_COLLECTION`   | `"site.standard.document"`                      | all articles — create, edit, list, orphan detection, nuke tool  |
| `PUBLICATION_COLLECTION`| `"site.standard.publication"`                   | publications — sites, site-list, list, configure, create, edit, home |
| `SLUG_RE`               | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`                 | article create, edit, site-list group create                    |
| `DOMAIN_RE`             | `/^[a-zA-Z0-9][a-zA-Z0-9\-._]*\.[a-zA-Z]{2,}$/`| sites, configure                                                |
| `IMAGE_URL_RE`          | `/^https:\/\//i`                                | article create, edit, configure — validates image URL fields    |

`app/services/auth.server.ts` also exports two server-only constants consumed by `client-metadata.ts`:

- `PUBLIC_URL_DEFAULT` — the `"https://scribe-cms.app"` fallback string
- `OAUTH_METADATA_STATIC` — the stable OAuth client config fields (`grant_types`, `response_types`, etc.) shared between the `NodeOAuthClient` config and the `/client-metadata.json` response

## Shared component types and utilities

`app/components/types.ts` is the canonical home for interfaces shared across two or more components or route loaders. Import from here rather than from individual component files:

| Export        | Used in                                                           |
| ------------- | ----------------------------------------------------------------- |
| `SiteCard`    | `SiteTile`, `SiteListItem`, `sites.tsx` loader, `list.tsx` loader |
| `SiteOption`  | `ArticleForm`, `create.tsx`, `edit.tsx`                           |
| `TreeArticle` | `GroupItem`, `site-list.tsx`                                      |

`SiteCard` shape:

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
  pendingSubmissionCount?: number;
  isContributor?: boolean;       // set for a site the caller contributes to, not owns
  ownerDisplayName?: string;     // only meaningful alongside isContributor
}
```

`app/components/utils.ts` is the canonical home for pure utility functions shared across components:

| Export                         | Purpose                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `composedUrl(site: SiteCard)`  | Returns `url/urlPrefix` or just `url` when prefix is empty                               |
| `hasTextContent(html: string)` | Returns `true` if the HTML contains non-whitespace text — used by the editor dirty check |

Components that originally defined these types/utils inline (`SiteTile`, `ArticleForm`, `GroupItem`) now import from the shared files and re-export for backwards compatibility. When adding a new shared type or utility, add it here rather than inside a component file.

**Note:** `app/routes/article/site-list/siteTree.ts` exports `SiteManifest` (with `groups`/`articles` arrays for the DnD tree) — structurally different from the component-layer `SiteCard` above. These serve different purposes and are intentionally kept separate to avoid cross-layer coupling. `ArticleRef` and `SiteGroup` are defined in `app/hooks/types.ts` — the canonical source used by both the public hooks and the server-side code. `siteTree.ts` re-exports them from `~/hooks/types` for backwards compatibility.

## Security

### HTTP response headers

`applySecurityHeaders(headers: Headers)` in `app/entry.server.tsx` is called once at the top of the request handler and sets the following headers on every response:

| Header                      | Value                                      | Notes                                                                 |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `X-Frame-Options`           | `SAMEORIGIN`                               | Prevents clickjacking; SAMEORIGIN allows future same-origin embedding |
| `X-Content-Type-Options`    | `nosniff`                                  | Prevents MIME-type sniffing                                           |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`          | Sends origin only to cross-origin requests                            |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()` | Disables device APIs                                                  |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`      | Production only (HTTP in dev would break)                             |
| `Content-Security-Policy`   | see below                                  |                                                                       |

### Content Security Policy

The CSP is built per-request in `app/entry.server.tsx` using a cryptographic nonce.

**Per-request nonce flow:**

1. The root loader (`app/root.tsx`) generates a nonce with `randomBytes(16).toString("base64")` and returns it in loader data.
2. `entry.server.tsx` reads it from `routerContext.staticHandlerContext.loaderData["root"]` (falls back to a fresh nonce for error pages).
3. `buildCsp(nonce)` constructs `script-src 'self' 'nonce-${nonce}'`.
4. `renderToPipeableStream` receives `{ nonce }` — React applies it to all Suspense streaming inline scripts.
5. `app/root.tsx` Layout applies `nonce={nonce}` to the theme-detection `<script>`, `<Scripts>`, and `<ScrollRestoration>`.

This approach is required because React 18 streaming SSR (`renderToPipeableStream`) injects dynamic inline `<script>` tags for Suspense boundary resolution (e.g. `$RC("S:0","B:0")`). These scripts have unpredictable content, so a static SHA-256 hash cannot whitelist them — a per-request nonce is the only correct solution.

**`style-src 'unsafe-inline'`** is required because the Lexical editor applies text formatting as inline `style` attributes, and article HTML rendered via `dangerouslySetInnerHTML` may also contain inline styles. This is a known constraint.

### HTML sanitisation

Article content from the AT Protocol (potentially modified by anyone with PDS access) is sanitised server-side via `isomorphic-dompurify` in the article view loader before being passed to `dangerouslySetInnerHTML`. Always sanitise AT-Protocol content before rendering as HTML.

### Login rate limiting

The `/login` action limits each IP to 10 attempts per 15-minute rolling window. Tracking uses a `login_attempts` table in `data/oauth.db` (same file as OAuth sessions). The `loginAttempts` export from `db.server.ts` provides `record(ip)`, `count(ip)`, and `isLimited(ip)`. Stale rows are pruned on startup via `pruneStaleLoginAttempts()`. The client IP is read from `X-Forwarded-For` (set by nginx).

### Structured audit logging

`pino` is the structured logger. The single logger instance lives in `shared/logger.ts` and is re-exported for app routes via `app/services/logger.server.ts`. The image service imports it directly from `../../shared/logger.js` (`.js` extension required for tsx/ESM compatibility).

```ts
// App routes:
import { logger } from "~/services/logger.server";
logger.info({ event: "article.create", user_did: did, rkey }, "article.create");

// Image service:
import { logger } from "../../shared/logger.js";
logger.info(
  { event: "image.upload", user_did, uuid, original_name },
  "image.upload",
);
```

Every log call passes a structured object as the first argument and the event name string as the second (pino convention). In production, PM2 captures stdout as log files.

**Audit events:**

| Event                | Level       | Emitter                            | Key fields                              |
| -------------------- | ----------- | ---------------------------------- | --------------------------------------- |
| `auth.login_attempt` | info / warn | `login.tsx`                        | ip, handle, outcome                     |
| `article.create`     | info        | `article.server.ts`                | user_did, rkey, site_count              |
| `article.update`     | info        | `article.server.ts`                | user_did, rkey, old_rkey?, slug_renamed |
| `article.delete`     | info        | `list.tsx`                         | user_did, rkey                          |
| `site.create`        | info        | `sites.tsx`                        | user_did, rkey                          |
| `site.delete`        | info        | `sites.tsx`                        | user_did, rkey                          |
| `site.configure`     | info        | `configure.tsx`                    | user_did, rkey                          |
| `article.nuke`       | warn        | `home.tsx`                         | user_did, collection_count              |
| `image.upload`       | info        | `image-service/src/queue.ts`       | user_did, uuid, original_name           |
| `image.delete`       | info        | `image-service/src/deleteImage.ts` | user_did, image_id, filename            |

### E2E production guard

`auth.server.ts` throws at module load if `NODE_ENV=production`, `E2E=true`, and `CI` is not also set. This prevents the dev-bypass mode from accidentally reaching a live server. GitLab CI sets `CI=true` automatically, so the E2E escape hatch continues to work in pipelines.

### SQLite migration pattern (HMR safety)

`migrate(db)` in `db.server.ts` is called **outside** the `global.__db` singleton guard — it runs on every module load. All `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements are idempotent, so this is safe. The reason: Vite HMR reloads the module but preserves the existing `global.__db` connection; without this, any migration that runs for the first time after a module reload would fail because `migrate()` was never called for that module instance.

```ts
function getDb(): Database.Database {
  if (!global.__db) {
    // create DB connection once
    global.__db = new Database(DB_PATH);
  }
  // always run — IF NOT EXISTS makes this idempotent, and HMR reuses global.__db
  migrate(global.__db);
  return global.__db;
}
```

## Server services

### `app/services/article.server.ts`

Shared server logic for article create and edit operations. Server-only — never imported client-side.

| Export                                                                 | Purpose                                                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateArticleFields(title, slug, splashImageUrl?)`                  | Validates title, URL slug, and splash image URL — returns an error string or `null`                                                              |
| `resolveThumbUrl(imageUrl)`                                            | Rewrites a size-variant image URL to its `thumb.webp` variant                                                                                    |
| `buildLooseSiteUrl(did, rkey)`                                         | ADR 0013 — the loose-document `site` field shape: `https://reader.scribe-atp.app/<did>/site.standard.document/<rkey>`                            |
| `buildLooseDocumentFields(did, rkey, currentPath, existingScribe)`     | Single source of truth for "what does loose mean" — returns `{ site, path, scribe }` with `domain`/`canonicalUrl` stripped. Shared by article creation and `unpublishArticle` so the two can't drift apart. |
| `buildArticleRef(fields)`                                              | Constructs an `ArticleRef` (cached snapshot) from article fields — return type is `ArticleRef` from `~/hooks/types`                              |

`buildArticleRef` is the single construction point for `ArticleRef` values. Always use it when creating or refreshing article refs to ensure all fields are correctly populated.

### `app/services/imageServiceClient.ts`

Client-side module (browser only) that centralises all HTTP calls to the Image Service (`/api/image-service/*`). Throws `ImageServiceError` on non-OK responses so callers can distinguish Image Service failures from other errors.

| Export                                               | Purpose                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `FolderOption`                                       | `{ id: number; name: string; parent_id: number \| null }`                       |
| `BulkCounts`                                         | `{ folderCount: number; imageCount: number }`                                   |
| `ImageServiceError`                                  | Error subclass thrown on non-OK responses; message is the server's error string |
| `UPLOAD_URL`                                         | `"/api/image-service/upload"` — POST target for XHR uploads                     |
| `progressUrl(uploadId)`                              | Returns the SSE endpoint URL for a given upload UUID                            |
| `browseFolders(folderId?)`                           | Fetches folder contents (`BrowseResponse`) — used by `ImagePickerModal`         |
| `getMyFolders()`                                     | Lists the current user's folders                                                |
| `createFolder(name, parentId)`                       | Creates a new folder, returns `{ id: number }`                                  |
| `deleteFolder(folderId)`                             | Deletes a folder and its contents                                               |
| `deleteImage(imageId)`                               | Deletes a single image                                                          |
| `moveImage(imageId, folderId)`                       | Moves a single image to a folder                                                |
| `bulkMove(imageIds, folderIds, destinationFolderId)` | Moves images and/or folders in bulk                                             |
| `getBulkDeleteCounts(imageIds, folderIds)`           | Returns counts of what would be deleted (for confirmation UI)                   |
| `bulkDelete(imageIds, folderIds)`                    | Permanently deletes images and/or folders in bulk                               |

Upload progress is tracked client-side via XHR `upload.progress` events (not this module) and SSE events from `progressUrl(uploadId)`. This module only provides the URL constants — `UploadModal.tsx` owns the XHR and SSE lifecycle.

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

| `/new` route                  | Base route                | Modal opened  |
| ----------------------------- | ------------------------- | ------------- |
| `/sites/new`                  | `/sites`                  | Add New Site  |
| `/groups/new`                 | `/groups`                 | Add New Group |
| `/article/list/:siteSlug/new` | `/article/list/:siteSlug` | Add New Group |

The dashboard Quick Actions link directly to these `/new` routes. When `useBlocker(isDirty)` is active (e.g. on site-list), navigating to `/new` with unsaved changes correctly triggers the "Unsaved changes" modal before proceeding.

**Note on Vite HMR:** after adding a new route to `routes.ts`, a hard browser refresh is sometimes needed before the route is recognised. If the modal doesn't open on first test, hard-refresh before debugging further.

## Toast + navigate pattern

Routes that save and then redirect (e.g. `site/configure`) use this pattern so the toast survives the navigation:

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

## Article edit — save UX

`/article/edit` does **not** redirect after a successful save. It stays on the edit page and:

- Shows a **"Article saved"** toast (auto-expires)
- Resets `isDirty` to `false`
- Updates `cidValue` state with `newCid` returned from the action — prevents a stale `swapRecord` on a second save without a page reload
- On a **slug rename**: performs a soft `navigate("/article/edit/${newSlug}", { replace: true })` instead of a hard redirect, so the URL updates without a full page reload

**Save button states** — the footer submit button reflects dirty state:

| State | Label        | Enabled |
| ----- | ------------ | ------- |
| Clean | No Changes   | No      |
| Dirty | Save Changes | Yes     |

`isDirty` is set to `true` by any form input change or content edit, and reset to `false` after a successful save. `cidValue` is held in `useState(cid)` — the initial CID comes from the loader; subsequent saves update it via `actionData.newCid` without requiring the loader to re-run.

**Create → edit flow** — `create.tsx` (real OAuth mode) navigates to `/article/edit/${slug}` after a successful save, landing the user on the edit page for the newly created article. Dev-bypass mode stays on the create page and shows a toast.

## Client metadata

`/client-metadata.json` is served by `app/routes/client-metadata.ts` — a resource route that generates the JSON dynamically from `PUBLIC_URL` at request time. This means the `client_id` and `redirect_uris` are always correct whether running locally via a tunnel or in production, with no manual file edits needed. The response includes `Cache-Control: no-store`.

The `client_id` is a plain URL (`${publicUrl}/client-metadata.json`) with no version query string. Versioning was tried as a cache-busting tactic but turned out to be unnecessary — the real scope issue was in `login.tsx` (see the critical note in the Auth section above).

**To add a new OAuth scope:** update `OAUTH_SCOPE` in `app/services/auth.server.ts` only — `client-metadata.ts` and `login.tsx` consume it automatically. Then ask users to re-authenticate (revoke at https://bsky.social/account and log in again).

## Shared types and utilities (`app/hooks/`)

`app/hooks/` (re-exported via `app/hooks/index.ts`) is now just the canonical home for `ArticleRef`/`SiteGroup`/`Site`/`Article` types and a couple of pure helpers, used internally by the CMS's own server-side code (`article.server.ts`, `siteManifest.server.ts`, `siteTree.ts`, etc.).

The `useSite`/`useArticle` React hooks that used to live here (a pre-SDK, no-auth read implementation) were deleted — `@scribe-atp/core`'s `fetchSite`/`fetchArticle` (published, PDS-resolution-aware) fully supersede them, and nothing in this repo imported them anymore. Consumer sites and any other external reader should use the SDK directly, not copy code from this directory.

### Helper functions (pure, no hooks)

| Function                | Purpose                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `slugFromUri(uri)`      | Returns the final path segment of an AT URI (the rkey / article slug)                                      |
| `flattenArticles(site)` | Returns all articles from a site in order: each group's articles followed by top-level ungrouped articles  |
| `toSlug(title)`         | Converts a human-readable title into a URL slug (lowercase, hyphens) — also re-exported from `siteTree.ts` |

### Types (exported from `app/hooks/types.ts`)

```ts
ArticleRef  { uri, title, slug?, splashImageUrl, description?, tags?, createdAt, publishedAt?, updatedAt? }
SiteGroup   { slug, title, articles: ArticleRef[] }
Site        { title, url, urlPrefix, description?, splashImageUrl?, logoImageUrl?, groups: SiteGroup[], ungroupedArticles: ArticleRef[] }
Article     { title, content, slug, path, site, splashImageUrl?, description?, tags?, createdAt, publishedAt, updatedAt }
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
- Lexical editor internals are mocked wholesale in `RichTextEditor.test.tsx` and `EditorToolbar.test.tsx`; `useLexicalComposerContext` is mocked via `vi.hoisted`. `RichTextEditor.test.tsx` uses `importOriginal` for the `lexical` mock (`vi.mock("lexical", async (importOriginal) => ({ ...actual, ... }))`) so that new Lexical exports added by `imageNode.tsx` or `ExtendedTextNode.ts` are available automatically — only `$getRoot` and `$insertNodes` are overridden. `EditorToolbar.test.tsx` uses a manual mock and must be kept in sync when new `lexical` exports are imported. Current mock includes `KEY_DOWN_COMMAND` and `COMMAND_PRIORITY_NORMAL` (added when the keyboard shortcuts handler was introduced). Test selectors use the full title attribute strings including shortcut hints (e.g. `getByTitle("Bold (Ctrl+B)")`), and regex matchers for dropdown items that include shortcut text (e.g. `getByRole("button", { name: /Strikethrough/ })`).

### Test philosophy

- **Prefer testing observable behaviour** over implementation details — what the user sees, what handlers get called, what the DOM communicates
- **Pure function tests** are highest value: no mocking needed and they catch silent data corruption (e.g. the `buildTreeFromSite`/`treeToSiteData` round-trip catching a dropped field)
- **Component tests** mock aggressively to isolate the unit; they verify rendering and interaction, not business logic
- **Business logic lives in route loaders/actions** — those are the next priority for test coverage

### siteTree utilities

`app/routes/article/site-list/siteTree.ts` contains the pure data-transformation functions extracted from `site-list.tsx`:

| Export                              | Purpose                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `buildTreeFromSite(site)`           | Converts a `SiteManifest` into a `TreeGroupNode[]` DnD tree (root node + named groups)         |
| `treeToSiteData(tree)`              | Inverse — converts the DnD tree back to `{ groups, ungroupedArticles }` for writing to the PDS |
| `nodeFromRef(ref)`                  | Converts an `ArticleRef` to a `TreeArticleNode` — single source of truth for the field mapping |
| `articleRefFromNode(node)`          | Converts a `TreeArticleNode` back to an `ArticleRef`                                           |
| `toSlug(title)`                     | Re-exported from `~/hooks/utils` — converts a title to a URL slug (lowercase, hyphens)         |
| `slugFromUri(uri)`                  | Re-exported from `~/hooks/utils` — returns the final path segment of an AT URI                 |
| `articleId(slug)` / `groupId(slug)` | Produces the dnd-kit sortable id (`a:{slug}` / `g:{slug}`)                                     |

**Critical invariant:** `treeToSiteData(buildTreeFromSite(site))` must reproduce the original `{ groups, ungroupedArticles }` exactly — including every `ArticleRef` field (`slug`, `description`, `splashImageUrl`, `publishedAt`, etc.). The round-trip tests in `siteTree.test.ts` enforce this.

**Types:** `ArticleRef` and `SiteGroup` are imported from `~/hooks/types` (not defined locally) and re-exported for backwards compatibility. `SiteManifest` (DnD tree form with `groups`/`articles` arrays) is exported from this module and is distinct from the component-layer `SiteCard` in `app/components/types.ts`.

### Running tests

```bash
npm test             # watch mode
npm run test:run     # single run (CI)
npm run test:coverage  # with coverage report
```

### Current coverage

All components in `app/components/` have test suites. Pure function coverage:

| File                                            | What's tested                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `app/constants.test.ts`                         | `SLUG_RE`, `DOMAIN_RE` valid/invalid cases; collection name constants                                                     |
| `app/hooks/utils.test.ts`                       | `slugFromUri`, `flattenArticles` ordering                                                                                 |
| `app/routes/article/site-list/siteTree.test.ts` | `toSlug`, `nodeFromRef`, `articleRefFromNode`, `buildTreeFromSite` field mapping, `treeToSiteData`, full round-trip suite |

**Next priority:** route loader/action tests (slug validation, site assignment logic, orphan detection).

## E2E tests (Playwright)

Full-journey browser tests that run against a **production build** with Chromium. 68 tests across 12 spec files covering all major user journeys. Decision rationale and considered alternatives are in `docs/adr/0006-e2e-testing-strategy.md`.

### Config

- `playwright.config.ts` — Chromium only; `reuseExistingServer: !CI`; 1 retry on CI; `storageState` set globally so all tests start authenticated
- `e2e/global-setup.ts` — logs in once before the test suite and saves the browser session to `e2e/.auth/session.json` (gitignored)
- `e2e/*.spec.ts` — one spec file per route area

### Auth mechanism

The `playwright.config.ts` `webServer.env` block sets `E2E=true`. This triggers a conditional in `app/services/auth.server.ts`:

```ts
export const useRealOAuth =
  (isProduction && process.env.E2E !== "true") ||
  process.env.DEV_USE_REAL_OAUTH === "true";
```

`react-router-serve` sets `NODE_ENV=production`, which would normally enable real OAuth. The `E2E=true` escape hatch forces dev-bypass mode so the global setup can log in by just submitting a handle — no Bluesky account or tunnel required. GitLab CI sets `CI=true` automatically, satisfying the production guard in `auth.server.ts` that prevents `E2E=true` from reaching a live server.

### Spec files

| File                          | Route(s)                                                | Tests |
| ----------------------------- | -------------------------------------------------------- | ----- |
| `e2e/login.spec.ts`           | `/login`                                                  | 2     |
| `e2e/home.spec.ts`            | `/`                                                       | 5     |
| `e2e/create-article.spec.ts`  | `/article/create`                                         | 5     |
| `e2e/edit-article.spec.ts`    | `/article/edit/:url`                                      | 7     |
| `e2e/view-article.spec.ts`    | `/article/view/:url`                                      | 3     |
| `e2e/article-list.spec.ts`    | `/article/list`                                           | 4     |
| `e2e/publish-workflow.spec.ts`| `/article/list` (Publish), `/article/list/:siteSlug` (Unpublish) — ADR 0013 | 11    |
| `e2e/logout.spec.ts`          | `/logout`                                                 | 2     |
| `e2e/sites.spec.ts`           | `/sites`, `/sites/new`                                    | 6     |
| `e2e/site-management.spec.ts` | `/groups`, `/article/list/:siteSlug`                      | 8     |
| `e2e/configure-site.spec.ts`  | `/site/:siteSlug/configure`                               | 4     |
| `e2e/images.spec.ts`          | `/images`                                                 | 11    |

### Selector conventions

- **Lexical editor**: use `'[contenteditable="true"]'` — CSS module class names are hashed in production builds
- **Aside menu collisions**: scope to `page.locator('main')` when a link text also appears in the aside (e.g. `"Image Library"` is both a quick action and an aside nav item)
- **Accessible labels on icon-only buttons**: `aria-label` is required — `SiteTile` and `SiteListItem` use `aria-label="Delete site"` on their icon-only danger buttons
- **Input label association**: `Input` components need an explicit `id` prop for `getByLabel()` to work — pass `id` matching `name` on all route-level `Input` usages

### Running E2E tests

```bash
npx playwright test              # full suite (builds + starts server if needed)
npx playwright test e2e/home.spec.ts  # single spec
npx playwright test --ui         # interactive UI mode
npx playwright show-report       # open last HTML report
```

## FullscreenImageViewer

`app/routes/images/FullscreenImageViewer.tsx` — purely presentational component. Props: `image: BrowseImage`, `images: BrowseImage[]`, `breadcrumbs: Array<{ id: number; name: string }>`, `onExit: () => void`.

**Fullscreen lifecycle is owned entirely by `ImagePreviewModal`**, not by this component. This separation is required because the browser's user-gesture activation window expires before any React effect fires — `requestFullscreen()` must be called synchronously inside the click handler.

`ImagePreviewModal` manages fullscreen via:

- A **permanent portal container** (`position: fixed; inset: 0; z-index: -1; background: #000`) portaled to `document.body` whenever `isOpen` is true. `z-index: -1` keeps it invisible behind page content when not in the browser's fullscreen top layer.
- A `handleOpenFullscreen` click handler that calls `flushSync(() => setFsOpen(true))` (synchronously renders `FullscreenImageViewer` content into the container) then immediately calls `container.requestFullscreen()` — both within the gesture window.
- A `fullscreenchange` listener that sets `fsOpen = false` when `document.fullscreenElement` is null, handling Escape key and all other native exits.

`FullscreenImageViewer`'s `onExit` prop is wired to `document.exitFullscreen()` in the parent; the `fullscreenchange` listener then unmounts the component.

**Image display:** always loads the `max` Variant. Two modes toggled by clicking the image:

- **Fit** (initial): centered, cursor `zoom-in`
- **Actual**: 1:1 pixel ratio, scrollable, cursor `zoom-out`

Mode resets to fit when navigating to a new image.

**Info pane:** fixed to the bottom of the fullscreen container, semi-transparent black background (`rgba(0,0,0,0.5)`), initially hidden. Slides in/out with a CSS `translateY` transition. Contains: filename, dimensions, file size, upload date, folder path, and Prev / Next / Close action buttons. The actions row has `padding-right: 4.8rem` to keep the Close button clear of the floating chevron. Prev/Next wrap around and are hidden when there is only one image. Close calls `onExit` (which calls `document.exitFullscreen()` in the parent) and uses the `FullscreenClose` icon.

**Chevron toggle:** circular button at `bottom: 1.2rem; right: 1.2rem`, z-index above the info pane. Shows `ChevronUp` when pane is closed, `ChevronDown` when open. Visibility is device-adaptive:

- `pointer: fine` (mouse): hidden by default; appears on `mousemove`; auto-hides after 3 s of inactivity
- `pointer: coarse` (touch): always visible via `@media (pointer: coarse)` CSS override

`BrowseImage` type is exported from `ImagePreviewModal.tsx` and shared by both components.

## Image Service

The Image Library feature is backed by a **dedicated Express service** running on port 3009, separate from the main React Router app. See `docs/adr/0001-separate-image-service.md` for why a separate process was chosen over a custom server entry. See `UBIQUITOUS_LANGUAGE.md` for canonical definitions of Image Library terms (Variant, Bounding Box, max, thumb, User Image Folder, Image Storage).

### Architecture overview

```
Browser
  ├── GET /images/*              → react-router-serve :3008  (Image Library UI route)
  ├── GET /image-storage/*       → nginx static files         (Variant serving — no Node.js)
  ├── POST /api/image-service/*  → Image Service :3009        (upload endpoint)
  └── GET /api/image-service/progress/:uploadId  → Image Service :3009  (SSE progress stream)
```

### Authentication

The Image Service reads the `__session` cookie and verifies it using `SESSION_SECRET` — the same secret used by the main app. No separate token exchange. The Image Service rejects requests with a missing or invalid cookie with 401.

**Cookie format:** React Router serialises the session as `btoa(unescape(encodeURIComponent(JSON.stringify(data)))).hmacSignature` — a UTF-8-safe encoding, base64-encoded _before_ signing, not stored as raw JSON. After `unsign()` verifies the HMAC and returns the raw value, decoding it requires `JSON.parse(decodeURIComponent(escape(atob(value))))`, not plain `atob()` + `JSON.parse()` — the latter only coincidentally works for ASCII-only payloads. If you see persistent 401s from the Image Service despite a correct `SESSION_SECRET`, this encoding step is the first thing to check.

**Shared verification module:** The signing algorithm is implemented once in `shared/cookieSession.ts` and exports `verifyScribeSession(cookieHeader, secret)`. `image-service/src/auth.ts` is a thin adapter that reads `SESSION_SECRET` from `process.env` and delegates to it. The main app does not use this module — it goes through React Router's opaque `createCookieSessionStorage`. Tests live in `shared/cookieSession.test.ts`.

**Shared logger:** The image service imports the pino logger from `../../shared/logger.js` (`.js` extension is required — the image service uses tsx/ESM). App routes use `~/services/logger.server.ts` which re-exports from the same shared module.

### Upload flow

1. Client generates a UUID (`uploadId`) per file
2. Client opens an SSE connection to `/api/image-service/progress/{uploadId}` before uploading
3. Client POSTs the file to `/api/image-service/upload` via XHR (parallel for multiple files)
4. XHR `upload.progress` events drive the upload phase progress bar client-side
5. Image Service queues the file for processing (sequential in-memory queue — one file at a time)
6. SSE stream emits `queued` → `variant:{name}` per Variant → `complete` as Sharp processes
7. SQLite `images` row is inserted only after all Variants are successfully written

### Variant generation

Sharp generates WebP Variants constrained by a bounding box on the longest side. Standard set: thumb (300px), 600, 1200, 1800, max (≤3000px cap). A Variant is skipped if its bounding box would exceed the source image's longest side — no upscaling. Storage path: `{IMAGE_STORAGE_ROOT}/{user_did}/{uuid}/{variant}.webp`.

**Sharp version pin:** `sharp` is pinned to `^0.32.6`. Sharp 0.33+ prebuilt binaries require the x86_64-v2 microarchitecture (SSE4.2), which the production VPS CPU does not support. 0.31.x ships prebuilt binaries for all x64 CPUs and bundles its own `@types/sharp`. Do not upgrade sharp without first verifying the target server's CPU supports x86_64-v2 (`grep -m1 flags /proc/cpuinfo | grep -o sse4_2`). See `docs/adr/0002-sharp-version-pin.md`.

### SQLite schema (separate from `data/oauth.db`)

```sql
image_folders (id, user_did, name, parent_id, created_at)
images        (id, user_did, folder_id, filename, original_name, width, height, sizes JSON, created_at)
```

`sizes` JSON records each generated Variant name and its actual pixel dimensions.

### Access control

A user can browse and use only: their own personal **User Image Folder**, plus the **Site Image Folder** of any site they own or are an accepted Contributor on (ADR 0028 — closed the previous gap where personal folders were openly browsable by any authenticated user; see ADR 0017/0020/0024 for the site-folder design history). Read and write access are gated by the same check.

- `image-service/src/access.ts`'s `canAccessFolder(did, folder)` is the single access gate, used by both read (`browse.ts`) and write (`folders.ts`, `deleteImage.ts`, `bulkOperations.ts`, `upload.ts`) endpoints: a personal folder (`user_did` set) is owner-only; a site folder (`site_uri` set) is accessible to the site's Owner or any DID with an `accepted` row in the CMS's `contributor_memberships` table for that site (read live via a second SQLite connection into the main app's `data/oauth.db` — ADR 0024, no sync/propagation delay)
- A `folderId` fetch for a folder the caller can't access 404s, not 403s — existence isn't confirmed to an unauthorized caller
- User Image Folders are auto-created on first upload; Site Image Folders are auto-created at site-creation time. Pre-existing sites (created before that existed) were backfilled 2026-07-20 via a one-shot script, since deleted per this repo's own convention (see ADR 0024/0028) — a new site created going forward needs no backfill

### Startup cleanup

On startup, the Image Service sweeps the filesystem for UUID directories with no corresponding `images` SQLite row and deletes them. These are left behind when the service restarts mid-processing.

### `/images` route loader — service availability

The `/images` route loader fetches browse data from the Image Service via `http://localhost:3009`. The fetch uses `AbortSignal.timeout(5000)` so a slow or unresponsive service fails fast rather than hanging the navigation indefinitely.

When the fetch fails for any reason (timeout, connection refused, non-OK response), the loader catches the error, logs it, and returns `{ serviceError: true, ...emptyData }`. The component renders an "Image Service unavailable" message with a **Retry** button that calls `revalidator.revalidate()` to re-run the loader without a full page navigation. Normal empty-state messages ("No images yet", "This folder is empty") are suppressed when `serviceError` is set.

## Key commands

```bash
npm run dev          # start app + Image Service together (ports 5173 and 3009)
npm run dev:app      # start app only (port 5173)
npm run build        # production build
npm run start        # serve production build (port 3008)
npm run typecheck    # react-router typegen + tsc
npm test             # run unit tests in watch mode
npm run test:run     # run unit tests once (CI)
npx playwright test  # run E2E suite (builds + starts server if not running)
npx react-router typegen  # regenerate route types after adding routes
```

## CI / Branch discipline

The GitLab CI pipeline (`.gitlab-ci.yml`) has four stages: `typecheck` → `unit` → `e2e` → `deploy`.

- **Unit and E2E tests** run only on **merge request pipelines** (`$CI_PIPELINE_SOURCE == "merge_request_event"`). They do not run on direct pushes to `main`.
- **Deploy** is a manual job that appears on the `main` branch pipeline after a merge.
- **`main` is a protected branch** — direct pushes are blocked for everyone (push access level: No one). All changes must go through an MR. This makes the post-merge test run redundant and safe to omit.

### Runner tags

| Tag                    | Runner                                           | Used by              |
| ---------------------- | ------------------------------------------------ | -------------------- |
| `SERVER-docker-runner` | Windows/Docker Desktop (Docker executor, faster) | typecheck, unit, e2e |
| `playwright`           | Imhotep (ARM64 Raspberry Pi, shell executor)     | deploy only          |

The deploy job stays on `playwright` (Imhotep) deliberately — if the Windows machine is offline, deploys can still run. The typecheck/unit/e2e jobs don't need this fallback so they run on the faster Docker runner.

If you need to temporarily allow a direct push (e.g. to fix CI config itself), update the branch protection via **Settings → Repository → Protected Branches** in GitLab, or via the API:

```bash
# Remove protection
curl -X DELETE https://<host>/api/v4/projects/<project>/protected_branches/main \
  --header "PRIVATE-TOKEN: <token>"

# Restore after
curl -X POST https://<host>/api/v4/projects/<project>/protected_branches \
  --header "PRIVATE-TOKEN: <token>" \
  --header "Content-Type: application/json" \
  --data '{"name":"main","push_access_level":0,"merge_access_level":40,"allow_force_push":false}'
```
