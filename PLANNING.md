# SCRIBE CMS DATA STRUCTURE

## Definitions

### User classifications

A OWNER is a user with the highest level of privileges, they can add, remove and change the SITEs via the CMS. They can add GROUPS and change the order they appear in. They can write ARTICLES and add them to GROUPS. They can add other users as CONTRIBUTORS to SITES. They can also see ARTICLES that CONTRIBUTORS have provided to this SITE and add them to GROUPS.

A CONTRIBUTOR is a user who has the ability to write articles for any SITE that they are a contributor to. Any article they write for that SITE will be available to the OWNER to add to GROUPS and publish on the SITE.

A user can become a CONTRIBUTOR after a OWNER adds the user to the Contributors list via the SITE management page. The exact mechanism as to how this can be achieved is not fully planned and this requires more thought. I think perhaps an email can be sent by the OWNER to the user who wishes to be a CONTRIBUTOR, the email (or bluesky dm?) will have a link the new CONTRIBUTOR clicks to join the list of contributors. Alternatives can be considered and I would welcome any ideas on other ways to achieve this.

## Concepts

A SITE is a reference to a website that we will use our CMS app to manage articles and content for. Its data comprises of a 'url' (string), 'title' (string), 'urlPrefix' (string), 'ownerId' (string: id of the user who is the owner of this site), 'contributors' (array, list of ids of users who can contribute articles to this site), 'groups' (array of objects, representing each of the groups of articles listed under this site)

A GROUP represents a collection of articles that are grouped together. Its data comprises of an array of objects. Each object represents a group and each group has a 'slug' (string) which is a section of the url that represents this category, 'title' (string) is the name that will be displayed in the UI, 'articles' (array of strings, each string being the slug of the articles that belong to this group)

AN ARTICLE represents an article or document, it comprises of a 'url' (string), 'title' (string), 'content' (string, serialised html) and 'createdAt' (string: timestamp)

## Rules

A SITE is owned by one single OWNER, the data for that site is stored on the OWNERs PDS

A SITE OWNER is solely responsible for the creation and order of GROUPS within the SITE(s) they own.

A SITE OWNER is solely responsible for assigning ARTICLES to GROUPS

## Data Structures

### Site

AT Protocol collection: `app.scribe.site`, rkey = URL-derived slug (e.g. `norobots-blog`)

```json
{
  "$type": "app.scribe.site",
  "url": "norobots.blog",
  "title": "NoRobots.blog",
  "urlPrefix": "blog",
  "description": "A blog about engineering and design.",
  "splashImageUrl": "https://norobots.blog/images/splash.jpg",
  "logoImageUrl": "https://norobots.blog/images/logo.png",
  "contributors": ["did:plc:contributorOneId", "did:plc:contributorTwoId"],
  "groups": [
    {
      "slug": "engineering",
      "title": "Engineering",
      "articles": [
        {
          "uri": "at://did:plc:ownerId/app.scribe.article/my-first-post",
          "title": "My First Post",
          "url": "my-first-post",
          "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
          "synopsis": "An introduction to the blog.",
          "createdAt": "2025-01-01T00:00:00.000Z",
          "updatedAt": "2025-06-01T10:00:00.000Z"
        },
        {
          "uri": "at://did:plc:contributorOneId/app.scribe.article/their-article",
          "title": "Their Article",
          "url": "their-article",
          "splashImageUrl": null,
          "synopsis": null,
          "createdAt": "2025-02-01T00:00:00.000Z",
          "updatedAt": "2025-02-01T00:00:00.000Z"
        }
      ]
    },
    {
      "slug": "design",
      "title": "Design",
      "articles": [
        {
          "uri": "at://did:plc:ownerId/app.scribe.article/design-principles",
          "title": "Design Principles",
          "url": "design-principles",
          "splashImageUrl": "https://norobots.blog/images/design-principles.jpg",
          "synopsis": "Core principles we follow.",
          "createdAt": "2025-03-01T00:00:00.000Z",
          "updatedAt": "2025-06-04T09:00:00.000Z"
        }
      ]
    }
  ],
  "ungroupedArticles": [
    {
      "uri": "at://did:plc:ownerId/app.scribe.article/ungrouped-post",
      "title": "Ungrouped Post",
      "url": "ungrouped-post",
      "splashImageUrl": null,
      "synopsis": null,
      "createdAt": "2025-04-01T00:00:00.000Z",
      "updatedAt": "2025-04-01T00:00:00.000Z"
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T12:00:00.000Z"
}
```

Notes:

- `ownerId` is omitted — the owner is whoever's PDS holds this record (their DID is the repo DID)
- `description`, `splashImageUrl`, `logoImageUrl` are optional site-level metadata fields; omitted from the record entirely when blank (not stored as empty strings)
- Article references (`ArticleRef`) are objects (not bare AT URIs) containing a cached snapshot of article metadata: `uri`, `title`, `url`, `splashImageUrl`, `synopsis`, `createdAt`, `updatedAt`
- `url` on an `ArticleRef` is the article slug — the same as the rkey; included so consumers don't have to parse the AT URI
- `synopsis` is nullable — not all articles have one
- `splashImageUrl` is nullable — not all articles have a splash image
- `uri` encodes everything needed to identify the article: author DID, collection, and rkey (slug)
- Cached metadata may go stale if the author edits their article — the edit action always refreshes `ArticleRef` entries in every site the article belongs to on save (`sitesToRefresh`), keeping refs current without manual re-ordering
- `cid` is deliberately excluded from `ArticleRef` — storing it would cause `swapRecord` failures after any edit to the article; fetch it live at the point of deletion
- Every field from `app.scribe.article` except `content` should be mirrored in `ArticleRef` — `content` is excluded because it can be arbitrarily large
- `ungroupedArticles` at the top level holds articles assigned to this site but not placed in any named group (same role as the ROOT virtual group in the current list view)
- `groups` order is significant — it determines display order on the site
- `updatedAt` is useful for cache invalidation by public readers

### Article

AT Protocol collection: `app.scribe.article`, rkey = url slug (e.g. `my-first-post`)

```json
{
  "$type": "app.scribe.article",
  "title": "My First Post",
  "url": "my-first-post",
  "content": "<p>Article body as serialised HTML.</p>",
  "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
  "synopsis": "An introduction to the blog.",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T10:00:00.000Z"
}
```

Notes:

- The article record is intentionally site-agnostic — it has no reference to any site or group
- The relationship between an article and a site is owned entirely by the SITE record (via AT URI in `groups[].articles` or top-level `articles`)
- The author is implicit from whose PDS holds the record — no `authorId` field is needed; the AT URI (`at://did/app.scribe.article/slug`) carries that information
- `url` doubles as the rkey — the slug used in the AT URI and in the public-facing URL path
- `splashImageUrl` is optional
- `synopsis` is optional — a short human-readable description; mirrored into every `ArticleRef` that references this article
- `createdAt` is set once on create and never changed; `updatedAt` is set on create and updated on every edit — the edit action preserves the original `createdAt` via a hidden form field

---

# Future Planning

The following are items relating to features that will be planned and implemented in the future, for now this is just an area for ideas:

## FEATURE: Image Library

### Status: Implemented (June 2026)

All items in this section are live on the VPS. The Image Service runs on port 3009 managed by PM2 (`scribe-atp.app-image-service`). The `/images` route is accessible to all authenticated users.

### Requirement

ScribeCMS requires the ability to upload and organise images for use in splash images and article content.

### Purpose

To enable users to provide and reference images for use in the Sites and Articles they manage in ScribeCMS.

### Architecture

The Image Library is served by a **dedicated Image Service** — a separate Express app running on port 3009 alongside the main React Router app (port 3008). See `docs/adr/0001-separate-image-service.md` for the rationale.

**nginx routing on the VPS:**

```
/images/*             → react-router-serve :3008  (Image Library management UI)
/image-storage/*      → filesystem (static, zero Node.js)  (Variant file serving)
/api/image-service/*  → Image Service :3009  (upload endpoint + SSE progress)
/*                    → react-router-serve :3008  (main app)
```

**Authentication:** The Image Service shares `SESSION_SECRET` with the main app and replicates the `__session` cookie-verification logic to identify the requesting user's DID. No separate token exchange is needed.

### Image Storage

Uploaded images are processed server-side by `sharp` and stored as pre-generated WebP Variants on the VPS filesystem. On-demand resizing was considered and rejected — see UBIQUITOUS_LANGUAGE.md for Variant/Bounding Box definitions.

**Variant set** (generated in ascending order; a Variant is skipped if its Bounding Box exceeds the source image's longest side — no upscaling):

| Variant | Bounding Box |
| :------ | :----------- |
| thumb   | 300px        |
| 600     | 600px        |
| 1200    | 1200px       |
| 1800    | 1800px       |
| max     | 3000px (cap) |

All Variants are WebP. The `max` Variant is the uploaded image at its original dimensions, converted to WebP, capped at a 3000px Bounding Box. "max" is the canonical term — not "original" (see UBIQUITOUS_LANGUAGE.md).

**Filesystem layout:**

```
{storage_root}/{user_did}/{uuid}/thumb.webp
{storage_root}/{user_did}/{uuid}/600.webp
{storage_root}/{user_did}/{uuid}/1200.webp
{storage_root}/{user_did}/{uuid}/1800.webp  ← omitted if source longest side < 1800
{storage_root}/{user_did}/{uuid}/max.webp
```

**Public URL pattern:** `/image-storage/{user_did}/{uuid}/{variant}.webp`

nginx serves `/image-storage/` directly from the filesystem — the Image Service is not involved in reads.

**Accepted source formats:** JPEG, PNG, WebP, TIFF, GIF. HEIC/AVIF excluded (requires `libheif`, not guaranteed on VPS).

**Upload file size limit:** 50MB per file.

**Sharp version constraint:** `sharp` is pinned to `^0.32.6`. The production VPS CPU predates the x86_64-v2 microarchitecture required by sharp 0.33+ prebuilt binaries. Do not upgrade without first checking CPU support: `grep -m1 flags /proc/cpuinfo | grep -o sse4_2`. See `docs/adr/0002-sharp-version-pin.md`.

**SQLite database** (separate file from `data/oauth.db`):

```sql
image_folders (id, user_did, name, parent_id, created_at)
images        (id, user_did, folder_id, filename, original_name, width, height, sizes JSON, created_at)
```

`sizes` JSON stores the generated Variant names and their actual pixel dimensions.

### Upload Flow

1. User clicks "Upload Image(s)" — opens a modal with drag-and-drop + `<input type="file" multiple>`
2. User selects or drops files — previews shown, "Upload (N) Files" button enabled
3. On submit: all files upload **in parallel** via XHR. Upload phase progress (0–100%) is driven by `xhr.upload.progress` events client-side — no server involvement.
4. Processing is **sequential** — the Image Service maintains an in-memory queue; files are processed one at a time by `sharp` to avoid CPU spikes on the shared VPS.
5. For each file, a **per-file SSE connection** (`/api/image-service/progress/{uploadId}`) is opened before the upload starts. The SSE stream drives the processing phase UI: one tick per Variant as `sharp` completes it (`thumb` → `600` → `1200` → `1800` → `max`), then a `complete` event.
6. Once all uploads are complete, newly uploaded images appear in the user's **User Image Folder** in the `/images` view.

**In-memory queue recovery:** if the Image Service restarts mid-processing, the in-flight UUID directory (with partial Variants) is orphaned on disk without a SQLite record. A startup sweep removes any UUID directories with no corresponding `images` row.

### Image Library UI (`/images`)

Windows Explorer-style grid of images and folders. Behaviour:

- **User Image Folder** — created automatically on a user's first upload. Each user has one top-level folder; all their images and subfolders live within it.
- **Browsing** — all authenticated users can browse and use any image in the library, including other users' User Image Folders.
- **Write restrictions** — upload, delete, move, and create subfolder are only permitted within the current user's own User Image Folder tree.
- **Folder deletion** — only empty folders can be deleted (prevents accidental loss).
- **Image deletion** — deletes all Variant files from the filesystem and the `images` SQLite row. A single confirmation modal warns that any Articles or Sites referencing the image URL will have broken images. No cross-reference check is performed.
- **Copy URL** — each image shows per-Variant copy buttons (only Variants that were actually generated for that image are shown). User selects which Variant URL to copy to clipboard.
- **Multi-select** — CTRL+click enters selection mode; Shift+click range-selects by DOM order (folders first, then images); checkboxes appear on hover and on all tiles once any item is selected; Escape or ✕ clears selection. Selection UI is only shown within the user's own tree (`isOwnTree`).
- **Selection toolbar** — replaces the normal top buttons when a selection is active: Move to, Delete, Add to New Folder, and ✕ N selected.
- **Bulk move** — moves all selected images and folders to a destination folder chosen from a picker. The picker excludes the current folder, selected folders, and their descendants (cycle-safe). Server-side cycle detection in the endpoint; atomic SQLite transaction.
- **Bulk delete** — recursive delete with a confirmation modal that dry-runs item counts (POST without `confirm`) before POSTing with `confirm: true`.
- **Add to New Folder** — compound action: prompts for a folder name, creates the folder in the current location, then bulk-moves all selected items into it in a single flow.
- **Drag and drop** — dnd-kit `PointerSensor` (8px activation distance to distinguish clicks from drags); folder tiles are drop targets; dragging a selected item moves all selected items; dragging an unselected item moves only that item; `DragOverlay` shows item name or "N items" badge; errors surface as persistent danger toasts.
- **Image preview modal** — double-click opens a modal showing the image at full width. Variant selector buttons switch the displayed URL and show per-Variant dimensions and file size (KB). Also shows original filename, upload date, and folder path. Prev/Next navigation (arrow keys supported). Own images get inline Delete (with inline confirmation state) and Move actions.

### Deferred

**Inline image picker in the Lexical editor** — a picker modal launchable from within the article editor to browse the Image Library and insert an image URL directly, without copy-paste. Deferred until the Image Library itself is complete.

## FEATURE: Dashboard

### Implemented

The dashboard (`/`) shows three sections for authenticated users:

**Quick Actions** — "New Site", "New Group", and "New Article" buttons. Each links to a modal-backed route (`/sites/new`, `/groups/new`, `/article/create`) that opens the relevant creation modal immediately on arrival. See the modal-backed route pattern in CLAUDE.md.

**Unassigned Articles alert** — a danger `Pill` linking to `/article/list` that appears only when one or more articles exist that are not referenced by any site. Computed in the loader by diffing all article URIs against all URIs referenced in `groups[].articles` and `articles` across every site record.

**Recently Updated** — the 5 most recently edited articles, sorted by `updatedAt` descending (falling back to `createdAt` for older records without `updatedAt`). Each row shows a Document `IconBadge`, the article title, and the edit timestamp formatted as `HH:MM DD/MM/YY` in a grey `Pill`. Fetched from `app.scribe.article` in the same loader pass as the orphan calculation.

Both PDS calls (articles + sites) are made in parallel via `Promise.all`. The home route uses `getAuthSession` (not `requireAuth`) so unauthenticated users still reach the page — the loader returns empty data in that case and the two authenticated sections are hidden.

### Deferred / not planned

**Traffic analytics** — the PDS is write-only from the CMS's perspective; public readers don't report back. This would require instrumenting the public-facing site and building a separate analytics backend — out of scope.

## FEATURE: Dark Mode

### Status: Implemented (June 2026)

Full light/dark mode support across all routes and components.

### Architecture

Two-layer CSS token system:

- `app/styles/colours.css` — palette-only (raw colour values, no semantics)
- `app/styles/tokens.css` — semantic design tokens mapped to palette colours; a `[data-theme="dark"]` block overrides the relevant tokens for dark mode

Theme is persisted in an unsigned `theme` cookie (max-age 1 year). On SSR, `app/services/theme.server.ts` reads the cookie and sets `data-theme` on `<html>` server-side — no flash for returning users. A small inline `<script>` in `<head>` handles the first-ever visit by reading `prefers-color-scheme` synchronously before paint.

Client-side, `app/context/ThemeContext.tsx` provides `ThemeProvider` / `useTheme()`. `toggleTheme` updates `data-theme` and the cookie directly (no server round-trip). The `DarkModeSwitch` component in the header wires to `useTheme`.

All component CSS modules use semantic tokens (`var(--surface-page)`, `var(--text-primary)`, etc.) — never hardcoded palette names.

See the **Theming** section in CLAUDE.md for the full token reference and implementation details.

## FEATURE: E2E Testing

### Status: Implemented (June 2026)

Full Playwright E2E suite covering all major user journeys. 41 tests across 10 spec files, all running against a production build with Chromium.

### Design decisions

- **Framework**: Playwright — built-in auto-wait, reliable cross-browser support, good TypeScript integration
- **Auth strategy**: dev-bypass mode activated by `E2E=true` env var (escape hatch in `auth.server.ts`). `global-setup.ts` logs in once; `storageState` reuses the session across all specs without re-authenticating per test
- **Build target**: production build (`react-router-serve`) — catches CSS module class hashing issues invisible in dev mode, and tests the real code path
- **Scope**: happy path + key regression guards (e.g. "Add New Group modal opens when button is clicked" — the exact regression that motivated the suite)

See `docs/adr/0006-e2e-testing-strategy.md` for the full decision record.
