# Scribe ATP

An AT Protocol-driven content management system. Authors write and store articles directly in their own [Bluesky](https://bsky.app) PDS (Personal Data Server) — the AT Protocol repository _is_ the database. No proprietary backend, no lock-in.

## How it works

Articles are stored as `app.scribe.article` records in the author's PDS. Sites (managed publications) are stored as `app.scribe.site` records. Because AT Protocol repositories are publicly readable without authentication, any consumer — a static site, a blog frontend, a feed — can fetch and display content directly from the PDS with no API key or intermediary.

Scribe ATP provides the authoring interface: write, organise, and publish.

## Features

- Sign in with any Bluesky account via OAuth (PKCE)
- Full-featured rich text editor: headings H1–H6, lists (bullet/numbered/checklist), code blocks with syntax highlighting, links, image insertion by URL, text colour and background, font family and size, subscript, superscript, strikethrough, indentation, alignment, and speech-to-text via the Web Speech API
- Organise articles into sites and named groups with drag-and-drop ordering
- Assign articles to multiple sites
- Unassigned articles alert — the dashboard flags any articles not referenced by any site
- Recently updated — the dashboard shows the five most recently edited articles
- **Image Library** — upload, organise, and serve images; automatic WebP conversion and multi-size Variant generation; multi-select with bulk move, bulk delete, and drag-and-drop reordering; image preview modal with per-Variant URL copy; fullscreen viewer
- **Collapsible sidebar navigation** — expands to show labels or collapses to icon-only; state persisted in localStorage; skip-to-content link for keyboard users
- **Accessibility** — native `<dialog>` modals with keyboard and screen reader support, correct label association on all form inputs, no double tab stops on linked buttons
- Public read access — no auth required for consumers; public React hooks included for building read-only frontends (see [Public hooks](#public-hooks))

## Stack

| Layer                | Technology                                                 |
| -------------------- | ---------------------------------------------------------- |
| Framework            | React Router v7 (framework mode, SSR)                      |
| Dev server / bundler | Vite                                                       |
| Language             | TypeScript (strict mode)                                   |
| AT Protocol auth     | @atproto/oauth-client-node — Bluesky OAuth PKCE            |
| AT Protocol calls    | @atproto/api — XRPC Agent                                  |
| OAuth session store  | better-sqlite3 — `data/oauth.db`                           |
| Rich text editor     | Lexical / @lexical/react                                   |
| Drag and drop        | @dnd-kit (core, sortable, utilities)                       |
| Styles               | CSS Modules                                                |
| Unit testing         | Vitest + React Testing Library + @testing-library/jest-dom |
| E2E testing          | Playwright (Chromium)                                      |
| Image Service        | Express on port 3009                                       |
| Image processing     | sharp — WebP Variant generation                            |
| Production server    | react-router-serve on port 3008                            |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Minimum required value:

```env
SESSION_SECRET=your-32-plus-character-random-secret
```

| Variable             | Required      | Purpose                                                                                                               |
| -------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`     | Yes           | Signs the `__session` cookie — must be 32+ random characters. Shared with the Image Service for session verification. |
| `PUBLIC_URL`         | Production    | Base URL e.g. `https://scribe-atp.app` — drives OAuth `client_id` and `redirect_uri`                                  |
| `DEV_USE_REAL_OAUTH` | Optional      | Set to `"true"` to use real Bluesky OAuth in development (requires a tunnel — see below)                              |
| `DEV_TUNNEL_HOST`    | Optional      | Cloudflare tunnel hostname (without `https://`)                                                                       |
| `DEV_PORT`           | Optional      | Dev server port if not 5173                                                                                           |
| `IMAGE_STORAGE_ROOT` | Image Service | Absolute filesystem path where image Variants are stored (e.g. `/var/scribe/images`)                                  |

### 3. Start the dev server

```bash
npm run dev
```

The app runs at `http://localhost:5173`. By default, development uses a **login bypass** — submitting any handle on the login page sets a session immediately without touching Bluesky's OAuth servers. This lets you work on the UI without a tunnel or a real account.

## Development with real OAuth

Bluesky's auth server must be able to reach your `client_id` URL — it cannot reach `localhost`. Use a tunnel:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Then in `.env`:

```env
DEV_USE_REAL_OAUTH="true"
PUBLIC_URL="https://your-tunnel-id.trycloudflare.com"
```

Access the app through the tunnel URL. The tunnel URL changes on every restart.

## Commands

```bash
npm run dev                   # dev server on port 5173
npm run build                 # production build
npm run start                 # serve production build on port 3008
npm run start:image-service   # start Image Service on port 3009
npm run typecheck             # react-router typegen + tsc
npm test                      # run unit tests in watch mode
npm run test:run              # run unit tests once (CI)
npm run test:coverage         # run unit tests with coverage report
npx playwright test           # run E2E suite (builds + starts server if not running)
npx playwright test --ui      # E2E interactive UI mode
```

## Architecture

Scribe ATP runs as two Node.js processes that share a `SESSION_SECRET`:

```
Browser
  ├── /* (app routes)              → react-router-serve :3008
  ├── /api/image-service/*         → Image Service :3009
  └── /image-storage/*             → nginx static files (Variant serving, no Node.js)
```

**Main app** (`react-router-serve :3008`) handles all UI routes, Bluesky OAuth, and AT Protocol reads/writes.

**Image Service** (`image-service/` on port 3009) is a standalone Express app responsible for image upload, Sharp processing, and SSE progress streaming. It authenticates requests by verifying the `__session` cookie using a shared verification module (`shared/cookieSession.ts`) that implements the same HMAC-SHA256 signing format as the main app's React Router session storage.

**SQLite databases** — two separate files, both created automatically on first run:

| File             | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `data/oauth.db`  | OAuth state and session tokens for the main app         |
| Image Service DB | Image folders and metadata (path configured separately) |

See `docs/adr/0001-separate-image-service.md` for why the Image Service runs as a separate process.

## AT Protocol collections

### `app.scribe.article` — rkey = URL slug

```json
{
  "$type": "app.scribe.article",
  "title": "My First Post",
  "url": "my-first-post",
  "content": "<p>Article body as serialised HTML.</p>",
  "splashImageUrl": "https://example.com/images/splash.jpg",
  "synopsis": "A short description.",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T10:00:00.000Z"
}
```

`splashImageUrl` and `synopsis` are optional. `content` is HTML produced by the Scribe rich text editor. `url` is the same as the rkey — both are the URL slug.

### `app.scribe.site` — rkey = URL-derived slug (e.g. `norobots-blog`)

```json
{
  "$type": "app.scribe.site",
  "title": "NoRobots.blog",
  "url": "norobots.blog",
  "urlPrefix": "blog",
  "description": "A blog about engineering and design.",
  "splashImageUrl": "https://norobots.blog/images/splash.jpg",
  "logoImageUrl": "https://norobots.blog/images/logo.png",
  "contributors": ["did:plc:contributorOneId"],
  "groups": [
    {
      "slug": "engineering",
      "title": "Engineering",
      "articles": [
        /* ArticleRef objects */
      ]
    }
  ],
  "ungroupedArticles": [
    /* ArticleRef objects */
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T12:00:00.000Z"
}
```

`description`, `splashImageUrl`, and `logoImageUrl` are optional. The site owner is implicit — it is whoever's PDS holds the record. `groups` order is significant and determines display order on the site.

#### ArticleRef — cached snapshot stored inside the site record

```ts
{
  uri: string;            // full AT URI — "at://did/app.scribe.article/slug"
  title: string;
  url: string;            // article slug, same as rkey
  splashImageUrl: string | null;
  synopsis: string | null;
  createdAt: string;      // ISO 8601
  updatedAt?: string;     // ISO 8601 — absent on older refs
}
```

ArticleRefs are automatically refreshed every time the source article is saved, keeping cached metadata current across all sites the article belongs to.

### Public read access

AT Protocol repositories are publicly readable without authentication:

```
GET https://{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection=app.scribe.article
GET https://{pds}/xrpc/com.atproto.repo.getRecord?repo={did}&collection=app.scribe.article&rkey={slug}
```

## Public hooks

`app/hooks/` provides React hooks for reading Scribe ATP data directly from the AT Protocol — no auth, no API backend required. These are intended to be copied into consumer websites (a public blog, a read-only frontend, etc.).

### `useSite`

Fetches the full site manifest — groups, articles, and metadata.

```ts
import { useSite } from "~/hooks";

const { site, loading, error } = useSite(author, siteSlug);
// author: Bluesky handle ("user.bsky.social") or DID
// siteSlug: the site's rkey e.g. "norobots-blog"
```

### `useArticle`

Fetches a single article including its HTML body content.

```ts
import { useArticle } from "~/hooks";

const { article, loading, error } = useArticle(author, articleSlug);
// articleSlug: the article's rkey / URL slug e.g. "my-first-post"
```

### Helper functions

```ts
import { slugFromUri, flattenArticles } from "~/hooks";

slugFromUri("at://did/app.scribe.article/my-post"); // → "my-post"
flattenArticles(site); // → ArticleRef[] — all grouped articles first, then ungrouped
```

Both hooks cancel in-flight fetches on unmount and accept either a handle or a DID for `author`. See `app/hooks/useSite.md` and `app/hooks/useArticle.md` for full usage examples.

> **Note:** all requests proxy through `https://public.api.bsky.app`, which works for `did:plc` identifiers on bsky.social. `did:web` and self-hosted PDS instances are not yet supported.

## Image Library

The Image Library (`/images`) is available to all authenticated users.

### Upload flow

1. Open the Upload modal — supports drag-and-drop or file picker, multiple files at once
2. Files upload **in parallel** via XHR — upload progress is driven by `xhr.upload.progress` events
3. Processing is **sequential** — the Image Service queues files and processes one at a time to avoid CPU spikes
4. A per-file SSE connection (`/api/image-service/progress/{uploadId}`) streams processing progress: one event per Variant as Sharp generates it, then a `complete` event
5. Completed images appear in the user's folder in the library grid

### Variants

Each uploaded image is converted to WebP and stored at multiple sizes. A Variant is skipped if its bounding box would exceed the source image's longest side — no upscaling.

| Variant | Bounding box                           |
| ------- | -------------------------------------- |
| `thumb` | 300px                                  |
| `600`   | 600px                                  |
| `1200`  | 1200px                                 |
| `1800`  | 1800px                                 |
| `max`   | ≤ 3000px (original dimensions, capped) |

Storage path: `{IMAGE_STORAGE_ROOT}/{user_did}/{uuid}/{variant}.webp`

Public URL pattern: `/image-storage/{user_did}/{uuid}/{variant}.webp` — served directly by nginx, not through Node.js.

### Browsing and organisation

- All authenticated users can browse and copy URLs from the entire library
- Write operations (upload, delete, move, create folder) are restricted to each user's own folder tree
- **Multi-select** — Ctrl+click activates selection mode; Shift+click range-selects; Escape clears selection
- **Bulk move** — move selected images and folders to any destination with cycle-safe validation
- **Bulk delete** — recursive delete with a dry-run count confirmation
- **Drag and drop** — drag a selected item to move all selected items; drag an unselected item to move only that item
- **Image preview** — double-click opens a full-detail modal with per-Variant URL copy, dimensions, file size, and Prev/Next navigation
- **Fullscreen viewer** — launch from the preview modal; Fit/Actual zoom modes; sliding info pane with navigation controls

> **sharp version note:** `sharp` is pinned to `^0.32.6`. The production VPS CPU predates the x86_64-v2 microarchitecture required by sharp 0.33+ prebuilds. Do not upgrade without first checking CPU support: `grep -m1 flags /proc/cpuinfo | grep -o sse4_2`. See `docs/adr/0002-sharp-version-pin.md`.

## Testing

### Unit tests (Vitest)

```bash
npm run test:run        # single run
npm test                # watch mode
npm run test:coverage   # with coverage report
```

Tests use **Vitest** with **React Testing Library**. All components in `app/components/` have co-located test suites. Pure function coverage includes the AT Protocol data-transformation utilities (`siteTree.ts`), the public hook utilities (`app/hooks/utils.ts`), constant validation patterns (`app/constants.ts`), and the shared cookie-session verification module (`shared/cookieSession.ts`).

Test files are co-located with their source:

- `app/components/Foo/Foo.test.tsx`
- `app/context/ThemeContext.test.tsx`
- `app/hooks/utils.test.ts`
- `app/routes/images/images.test.tsx`
- `app/services/articleSiteSync.test.ts`
- `app/services/theme.server.test.ts`
- `shared/cookieSession.test.ts`

### E2E tests (Playwright)

```bash
npx playwright test           # full suite — 46 tests across 11 spec files
npx playwright test --ui      # interactive UI mode
npx playwright show-report    # view last HTML report
```

E2E tests run against a **production build** (`npm run build && npm run start`) using Chromium. An `E2E=true` env var activates dev-bypass auth in the production binary so no real Bluesky account is needed. `e2e/global-setup.ts` logs in once and saves a `storageState` session reused by all specs. See `docs/adr/0006-e2e-testing-strategy.md` for the full design rationale.

## Production

### Build and start

```bash
npm run build
npm run start   # react-router-serve on port 3008
```

Set `SESSION_SECRET` and `PUBLIC_URL` in your environment. The SQLite database for OAuth sessions is created automatically at `data/oauth.db` on first run.

### Image Service

Start the Image Service separately (or via a process manager like PM2):

```bash
npm run start:image-service
```

Required environment variables for the Image Service:

```env
SESSION_SECRET=<same value as the main app>
IMAGE_STORAGE_ROOT=/var/scribe/images
```

The Image Service runs on port 3009 by default. Configure nginx to proxy `/api/image-service/*` to it and to serve `/image-storage/*` directly from the filesystem.

### nginx routing example

```nginx
location /image-storage/ {
    alias /var/scribe/images/;
}

location /api/image-service/ {
    proxy_pass http://localhost:3009/;
}

location / {
    proxy_pass http://localhost:3008;
}
```

### Multi-instance deployments

The main app's SQLite session store (`data/oauth.db`) is single-host. For multi-instance deployments, replace it with a shared store (Turso/libSQL, Redis, etc.).

## Project documentation

| File                      | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `CLAUDE.md`               | Architecture, patterns, and conventions for AI-assisted development |
| `PLANNING.md`             | Feature specs, data structures, and implementation notes            |
| `UBIQUITOUS_LANGUAGE.md`  | Canonical glossary of domain terms                                  |
| `docs/adr/`               | Architecture Decision Records                                       |
| `app/hooks/useSite.md`    | `useSite` hook usage and examples                                   |
| `app/hooks/useArticle.md` | `useArticle` hook usage and examples                                |
