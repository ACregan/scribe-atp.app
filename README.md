# Scribe ATP

An AT Protocol-driven content management system. Authors write and store articles directly in their own [Bluesky](https://bsky.app) PDS (Personal Data Server) — the AT Protocol repository *is* the database. No proprietary backend, no lock-in.

## How it works

Articles are stored as `app.scribe.article` records in the author's PDS. Sites (managed publications) are stored as `app.scribe.site` records. Because AT Protocol repositories are publicly readable without authentication, any consumer — a static site, a blog frontend, a feed — can fetch and display content directly from the PDS with no API key or intermediary.

Scribe ATP provides the authoring interface: write, organise, and publish.

## Stack

- **React Router v7** (framework mode, SSR)
- **Vite** — dev server and bundler
- **TypeScript** (strict mode)
- **@atproto/oauth-client-node** — Bluesky OAuth PKCE flow
- **@atproto/api** — AT Protocol XRPC calls
- **better-sqlite3** — SQLite store for OAuth state and sessions
- **Lexical / @lexical/react** — WYSIWYG rich text editor (content stored as HTML)
- **@dnd-kit** — drag-and-drop for article and group reordering
- **CSS Modules** — scoped component styles
- **Express** (Image Service) — dedicated service on port 3009 for image upload, Sharp processing, and SSE progress streaming
- **sharp** (Image Service) — server-side image processing and WebP Variant generation

## Features

- Sign in with any Bluesky account via OAuth
- Write articles with a full-featured rich text editor (headings, lists, code blocks, links, colour, speech-to-text, and more)
- Organise articles into sites and named groups with drag-and-drop ordering
- Assign articles to multiple sites
- Public read access — no auth required for consumers
- **Image Library** — upload, organise, and serve images; WebP conversion and multi-size Variant generation via Sharp; multi-select with bulk move, bulk delete, and drag-and-drop; image preview modal with per-Variant copy URLs

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
SESSION_SECRET=your-32-plus-character-random-secret
```

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Signs the `__session` cookie — must be 32+ random characters. Also used by the Image Service for session verification. |
| `PUBLIC_URL` | Production | Base URL e.g. `https://scribe-atp.app` — drives OAuth `client_id` and `redirect_uri` |
| `DEV_USE_REAL_OAUTH` | Optional | Set to `"true"` to use real Bluesky OAuth in development (requires a tunnel — see below) |
| `DEV_TUNNEL_HOST` | Optional | Cloudflare tunnel hostname (without `https://`) |
| `DEV_PORT` | Optional | Dev server port if not 5173 |
| `IMAGE_STORAGE_ROOT` | Image Service | Absolute filesystem path where uploaded image Variants are stored (e.g. `/var/scribe/images`) |

### 3. Start the dev server

```bash
npm run dev
```

The app runs at `http://localhost:5173`. By default, development uses a **login bypass** — submitting any handle on the login page sets a session immediately without hitting Bluesky's OAuth servers. This lets you work on the UI without a tunnel or a real account.

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
npm run dev           # start dev server (port 5173)
npm run build         # production build
npm run start         # serve production build (port 3008)
npm run typecheck     # react-router typegen + tsc
npm test              # run tests in watch mode
npm run test:run      # run tests once (CI)
```

## AT Protocol collections

| Collection | Purpose |
|---|---|
| `app.scribe.article` | Article content — rkey is the URL slug |
| `app.scribe.site` | Site manifest — groups, article order, metadata |

Records are stored in the authenticated user's own PDS and are publicly readable at:

```
GET https://{pds}/xrpc/com.atproto.repo.listRecords?repo={did}&collection=app.scribe.article
GET https://{pds}/xrpc/com.atproto.repo.getRecord?repo={did}&collection=app.scribe.article&rkey={slug}
```

## Production

Build and serve:

```bash
npm run build
npm run start   # react-router-serve on port 3008
```

Set `SESSION_SECRET` and `PUBLIC_URL` in your environment. The SQLite database for OAuth sessions is created automatically at `data/oauth.db` on first run.

For multi-instance deployments, replace the SQLite session store with a shared store (Turso, Redis, etc.).
