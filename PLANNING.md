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
          "uri": "at://did:plc:ownerId/site.standard.document/my-first-post",
          "title": "My First Post",
          "slug": "my-first-post",
          "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
          "description": "An introduction to the blog.",
          "createdAt": "2025-01-01T00:00:00.000Z",
          "publishedAt": "2025-01-01T00:00:00.000Z",
          "updatedAt": "2025-06-01T10:00:00.000Z"
        },
        {
          "uri": "at://did:plc:contributorOneId/site.standard.document/their-article",
          "title": "Their Article",
          "slug": "their-article",
          "splashImageUrl": null,
          "description": null,
          "createdAt": "2025-02-01T00:00:00.000Z",
          "publishedAt": "2025-02-01T00:00:00.000Z",
          "updatedAt": "2025-02-01T00:00:00.000Z"
        }
      ]
    },
    {
      "slug": "design",
      "title": "Design",
      "articles": [
        {
          "uri": "at://did:plc:ownerId/site.standard.document/design-principles",
          "title": "Design Principles",
          "slug": "design-principles",
          "splashImageUrl": "https://norobots.blog/images/design-principles.jpg",
          "description": "Core principles we follow.",
          "createdAt": "2025-03-01T00:00:00.000Z",
          "updatedAt": "2025-06-04T09:00:00.000Z"
        }
      ]
    }
  ],
  "ungroupedArticles": [
    {
      "uri": "at://did:plc:ownerId/site.standard.document/ungrouped-post",
      "title": "Ungrouped Post",
      "slug": "ungrouped-post",
      "splashImageUrl": null,
      "description": null,
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
- Article references (`ArticleRef`) are objects (not bare AT URIs) containing a cached snapshot of article metadata: `uri`, `title`, `slug`, `splashImageUrl`, `description`, `createdAt`, `publishedAt`, `updatedAt`
- `slug` on an `ArticleRef` is the article slug — the same as the rkey; included so consumers don't have to parse the AT URI
- `description` is nullable — not all articles have one
- `splashImageUrl` is nullable — not all articles have a splash image
- `uri` encodes everything needed to identify the article: author DID, collection, and rkey (slug)
- Cached metadata may go stale if the author edits their article — the edit action always refreshes `ArticleRef` entries in every site the article belongs to on save (`sitesToRefresh`), keeping refs current without manual re-ordering
- `cid` is deliberately excluded from `ArticleRef` — storing it would cause `swapRecord` failures after any edit to the article; fetch it live at the point of deletion
- Every field from `app.scribe.article` / `site.standard.document` except `content` should be mirrored in `ArticleRef` — `content` is excluded because it can be arbitrarily large
- `ungroupedArticles` at the top level holds articles assigned to this site but not placed in any named group (same role as the ROOT virtual group in the current list view)
- `groups` order is significant — it determines display order on the site
- `updatedAt` is useful for cache invalidation by public readers

### Article (Draft)

AT Protocol collection: `app.scribe.article`, rkey = slug (e.g. `my-first-post`)

Drafts use the `site.standard.document` field shape but omit `site` and `publishedAt`. `createdAt` is a Scribe extension field.

```json
{
  "$type": "app.scribe.article",
  "title": "My First Post",
  "slug": "my-first-post",
  "content": { "$type": "app.scribe.content.html", "html": "<p>Article body as serialised HTML.</p>" },
  "textContent": "Article body as serialised HTML.",
  "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
  "description": "An introduction to the blog.",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T10:00:00.000Z"
}
```

### Article (Published)

AT Protocol collection: `site.standard.document`, rkey = slug (e.g. `my-first-post`)

```json
{
  "$type": "site.standard.document",
  "title": "My First Post",
  "slug": "my-first-post",
  "path": "/engineering/my-first-post",
  "site": "https://norobots.blog/blog",
  "content": { "$type": "app.scribe.content.html", "html": "<p>Article body as serialised HTML.</p>" },
  "textContent": "Article body as serialised HTML.",
  "splashImageUrl": "https://norobots.blog/images/my-first-post.jpg",
  "description": "An introduction to the blog.",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "publishedAt": "2025-06-01T09:00:00.000Z",
  "updatedAt": "2025-06-01T10:00:00.000Z"
}
```

Notes:

- The article record is intentionally site-agnostic for drafts — no `site` or `publishedAt`. Published records carry the Canonical Site URL in `site`.
- The relationship between an article and a site is owned by the SITE record (via AT URI in `groups[].articles` or `ungroupedArticles`)
- The author is implicit from whose PDS holds the record — no `authorId` field is needed; the AT URI (`at://did/app.scribe.article/slug` or `at://did/site.standard.document/slug`) carries that information
- `slug` doubles as the rkey — the slug used in the AT URI and in the public-facing URL path
- `path` is `/{group-slug}/{article-slug}` when in a named group; `/{article-slug}` when ungrouped. Updated when an article is moved between groups.
- `splashImageUrl` is a Scribe extension field (standard.site uses a blob `coverImage` which Scribe does not adopt — see ADR planned)
- `description` is optional — a short human-readable description; mirrored into every `ArticleRef` that references this article
- `createdAt` is a Scribe extension field set once on create and never changed; `updatedAt` is set on create and updated on every edit
- `publishedAt` is absent on drafts; set to the actual publish instant on `site.standard.document` records (see ADR 0009)

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

### Image Library integration with the Lexical editor

**Inline image picker (June 2026)** — the toolbar image button (SVG icon — `SvgImageList.Image`) no longer shows an inline URL input. It opens `ImagePickerModal` (`app/components/ImagePickerModal/`), which browses the Image Library folder tree, shows image thumbnails, and on selection dispatches `INSERT_IMAGE_COMMAND` with the `max` Variant URL. Shared browser types (`BrowseFolder`, `BrowseImage`, `BrowseResponse`, helper functions) live in `imageBrowserTypes.ts` and are imported by both the picker and the `/images` route. `browseFolders(folderId?)` was added to `imageServiceClient.ts` for this purpose.

**Resizable images (June 2026)** — `ImageNode` stores `__width: number | null` (default null). Width round-trips through HTML (`style="width: Npx; max-width: 100%;"`) and Lexical JSON (`width` field, backwards-compatible). `ImageNode.decorate()` returns `<ImageResizeDecorator>` which renders left/right drag handles on hover or Lexical node selection. Drag updates local state; mouseup commits via a single `editor.update(() => node.setWidth(finalWidth))`. Minimum width: 80px. A pixel badge overlays the image during drag. A **Reset size** button appears on hover/selection when a manual width is set, allowing the user to revert to natural/fluid width. The click-outside deselect handler uses a stable dep array (`[clearSelection, setSelected]`) so it is not re-registered on every Lexical selection change.

**Editable alt text on images (June 2026)** — An `"Alt text"` button (bottom-left of the image, visible on hover/select, same pill style as "Reset size") opens a `<Modal>` with a `<Textarea>` pre-filled with the current alt text. Save is disabled until the value changes; empty string is allowed (valid decorative-image declaration). `ImageNode.setAltText()` commits via `editor.update(fn, { discrete: true })` so the update is synchronous. A module-level `Set<NodeKey> openModals` survives decorator remounts where `useState` would reset. Images are inserted with `altText: ""` — filenames are worse than empty for screen readers. Design rationale and the five failure modes of the earlier inline-input approach are documented in `docs/adr/0007-image-alt-text-modal-not-inline.md`.

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

Full Playwright E2E suite covering all major user journeys. 46 tests across 11 spec files, all running against a production build with Chromium.

### Design decisions

- **Framework**: Playwright — built-in auto-wait, reliable cross-browser support, good TypeScript integration
- **Auth strategy**: dev-bypass mode activated by `E2E=true` env var (escape hatch in `auth.server.ts`). `global-setup.ts` logs in once; `storageState` reuses the session across all specs without re-authenticating per test
- **Build target**: production build (`react-router-serve`) — catches CSS module class hashing issues invisible in dev mode, and tests the real code path
- **Scope**: happy path + key regression guards (e.g. "Add New Group modal opens when button is clicked" — the exact regression that motivated the suite)

See `docs/adr/0006-e2e-testing-strategy.md` for the full decision record.

## FEATURE: Accessibility

### Status: Implemented (June 2026)

Systematic pass targeting WCAG 2.1 AA compliance across the application.

### Changes

- **Native `<dialog>` modals** — `Modal` component replaced the old `createPortal` + `div` approach with a native `<dialog>` element opened via `showModal()`. Gains built-in focus trapping, Escape key handling, backdrop click, and correct `role="dialog"` semantics. `aria-labelledby` wired to the modal title via `useId()`.
- **Collapsible sidebar** — `AsideMenu` now accepts `expanded: boolean` and `onToggle: () => void` props. State is owned by `core.tsx` and persisted in `localStorage` under `"aside-expanded"`. Collapsed mode (6 rem) shows icons only with tooltip labels; expanded mode (20 rem) shows icons and label text. In collapsed mode each nav link carries `aria-label` so the accessible name is present without visible text.
- **Skip-to-content link** — `<a href="#main-content">Skip to main content</a>` rendered before the layout grid in `core.tsx`; `<main id="main-content">` is the target. Visible on focus only (CSS `.skipLink`).
- **Form input label association** — all `<Input>` usages that render a `<label>` now receive an explicit `id` prop matching `name`. Without a matching `id`, `htmlFor` has no element to point at (WCAG 2.1 AA failure).
- **`<Link><Button>` double tab stop** — every `<Button>` nested inside a `<Link>` now carries `tabIndex={-1}`. The `<a>` is the single tab stop; the button is kept in the DOM for pointer access but removed from the keyboard tab order.
- **Button `type` default** — `Button` component defaults to `type="button"`. Prevents accidental form submission when a `<Button>` sits inside a `<Form>` without an explicit type; all intentional submit buttons already pass `type="submit"` explicitly.
- **`DarkModeSwitch`** — converted from a `<div>` to a `<button>` with a dynamic `aria-label` ("Switch to light mode" / "Switch to dark mode").

## FEATURE: Lexical Editor Enhancements

### Status: Implemented (June 2026)

Four editor improvements shipped in this cycle.

### Save Changes UX

The article edit route (`/article/edit/:url`) no longer redirects to `/article/list` after a successful save. It stays on the page.

- **Save button** — shows `"No Changes"` (disabled) when the form is clean and `"Save Changes"` (enabled) when dirty. `isDirty` resets to `false` after a successful save.
- **CID management** — the latest `cid` is held in `useState(cid)` as `cidValue`. The action returns `newCid` from each successful `putRecord`; the component updates state with it. This prevents stale `swapRecord` failures on a second save without a page reload.
- **Slug rename** — performs a soft `navigate("/article/edit/${newSlug}", { replace: true })` rather than a hard redirect, keeping the user on the edit page at the updated URL.
- **Create → edit flow** — `create.tsx` (real OAuth mode) navigates to `/article/edit/${slug}` after save, landing on the edit page for the newly created article.

### Keyboard Shortcuts

`KEY_DOWN_COMMAND` handler registered in `ToolbarPlugin.tsx`. Uses `event.code` (physical key position) for digit matching to work across keyboard layouts.

| Shortcut         | Action             |
| ---------------- | ------------------ |
| `Ctrl+Shift+\``  | Normal paragraph   |
| `Ctrl+Shift+1–6` | Heading 1–6        |
| `Ctrl+Shift+7`   | Numbered list      |
| `Ctrl+Shift+8`   | Bullet list        |
| `Ctrl+Shift+9`   | Blockquote         |
| `Ctrl+Shift+S`   | Strikethrough      |
| `Ctrl+\``        | Inline code        |
| `Ctrl+\`         | Clear formatting   |
| `Ctrl+K`         | Insert / edit link |

**Platform notes:**

- `Ctrl+Alt` (AltGr) was rejected: composed characters are inserted via `beforeinput` and cannot be suppressed with `keydown.preventDefault()`.
- `Ctrl+Shift+0` was rejected: intercepted by the Windows OS input method manager universally.
- `Ctrl+Shift+N` digits may be intercepted on Windows systems with multiple keyboard layouts installed (each layout is assigned `Ctrl+Shift+N`). `Ctrl+Shift+\`` (backtick) avoids this — Windows does not assign language shortcuts to symbol keys.

**Discoverability** — toolbar button `title` attributes include shortcut hints (e.g. `"Bold (Ctrl+B)"`). `DropdownItem` has an optional `shortcut?: string` prop that renders muted monospace text. A `?` toolbar button opens a modal with a full shortcut reference table.

### Image Library Picker

The toolbar's 🖼 button opens `ImagePickerModal` instead of an inline URL input. The modal browses the Image Service folder tree, shows thumbnails, and dispatches `INSERT_IMAGE_COMMAND` on selection. See the Image Library section above for detail.

### Resizable Images

Inserted images can be resized by dragging handles on their left and right edges. Width is stored on `ImageNode` and round-trips through HTML and Lexical JSON. See the Image Library section above for detail.

### Bug Fixes (June 2026)

Three Lexical editor bugs fixed after the initial Enhancements release.

#### Bug 1 — Image picker inserted relative URLs

**Symptom:** Images inserted via `ImagePickerModal` worked in Scribe but appeared broken on external consumer sites.

**Root cause:** `handlePick` in `ImagePickerModal.tsx` passed the raw `/image-storage/...` path from `variantUrl()` to `INSERT_IMAGE_COMMAND`. External blog sites resolve relative URLs against their own domain, not the image host.

**Fix:** `handlePick` now prefixes with `window.location.origin` and passes `""` as alt text (changed from `image.original_name` — filenames are worse than empty for screen readers):

```ts
onPick(`${window.location.origin}${variantUrl(image, variant)}`, "");
```

All image `src` attributes stored in article HTML are now absolute URLs.

---

#### Bug 2 — Image resize drag showed flash / second resize failed

**Symptom:** After releasing a drag handle, the width badge briefly flashed back to the start value before settling. On a second drag that started at the same pixel width as the node's stored width, the badge appeared and immediately vanished.

**Root cause:** A catch-up `useEffect` in `ImageResizeDecorator` cleared `dragWidth` whenever `dragWidth === width` (i.e., Lexical had confirmed the new width in props). This effect also fired at drag *start* if the user grabbed the handle at the image's natural stored width — because `dragWidth` and `width` were equal before any movement had occurred.

**Fix:** Added `commitPendingRef = useRef(false)`. Set to `true` on mouseup (before `editor.update()`); the catch-up `useEffect` now requires `commitPendingRef.current` to be `true` before clearing `dragWidth`, then resets the flag. This scopes the clear to the genuine post-commit path only.

---

#### Bug 3 — `/article/create` immediately marked dirty; `/article/edit` also immediately dirty after fixing bug 3; stats showed 0 on existing articles

These three issues all share the same root cause in how Lexical's update listeners interact with the `InitialValuePlugin` content load.

**Shared root cause:** `OnChangePlugin` (previously used by `HiddenFieldPlugin` and `StatsPlugin`) has a built-in `prevEditorState.isEmpty()` guard: it skips the update when the previous editor state was truly empty (`_nodeMap.size === 1 && _selection === null`). This guard served two roles simultaneously:
1. Blocking the initial mount transition on `/article/create` (Lexical transitions from an empty state to an empty paragraph, which `OnChangePlugin` would otherwise treat as user input).
2. Blocking the `InitialValuePlugin` content load on `/article/edit` (which also transitions from the empty initial state).

Replacing `OnChangePlugin` with bare `editor.registerUpdateListener` (needed to fix the Reset size dirty-state bug and the stats-on-load bug) removed role 1, causing `/article/create` to be marked dirty on mount.

**Fix — `HiddenFieldPlugin`:** Uses `editor.registerUpdateListener` with two guards:
1. `prevEditorState.isEmpty()` guard retained — blocks the initial mount transition on create page.
2. `lastHtmlRef` initialised to `defaultValue` (the loaded content, NOT `""`). On the edit page, the `isEmpty` guard skips `InitialValuePlugin`, but any subsequent Lexical update produces the same HTML as the pre-seeded `lastHtmlRef` → equality check catches it → `onChange` is not called. Without this seeding, `lastHtmlRef` would be `""`, the first post-`InitialValuePlugin` update would see loaded HTML ≠ `""`, and `onChange` would fire falsely.

**Fix — `edit.tsx`:** Removed `contentInitializedRef` entirely. Because `HiddenFieldPlugin`'s two guards prevent any init-phase call from reaching `handleContentChange`, every call that does arrive is a genuine user edit.

**Fix — `StatsPlugin`:** Replaced `OnChangePlugin` with `editor.registerUpdateListener` + `dirtyElements.size === 0 && dirtyLeaves.size === 0` guard (skips pure selection/cursor changes). Unlike `HiddenFieldPlugin`, `StatsPlugin` does **not** use the `isEmpty` guard — zero stats on an empty editor is correct, and skipping `InitialValuePlugin` would cause the on-load "0 words" regression. The `dirtyElements`/`dirtyLeaves` check is sufficient.

---

#### Bug 4 — Alt text modal buttons and textarea were collapsed to near-zero height

**Symptom:** After implementing the alt text modal on `ImageResizeDecorator`, the modal's Save/Cancel buttons were only a few pixels high, the textarea appeared smaller than an `<input>`, and labels overflowed.

**Root cause:** `ImageResizeDecorator` renders inside a `.wrapper` div with `line-height: 0` (required to suppress whitespace below the image). The `<dialog>` element is a DOM child of `.wrapper`, so even though `showModal()` promotes it to the browser's top layer visually, CSS `line-height` is still inherited from the DOM ancestor. `line-height: 0` caused button and textarea text height to collapse to zero.

**Fix:** Added `line-height: 1.5` to the `.dialog` rule in `Modal.module.css`. This resets the value at the dialog root regardless of what DOM parent it is nested under, so the `Modal` component is robust to any inherited `line-height` context.

---

## FEATURE: Contributors

### Status: Planned — design complete (ADRs 0014–0018 in `docs/adr/`), phased implementation not yet started

### Overview

Lets a site Owner grant other Bluesky accounts ("Contributors") permission to write articles for their site. A Contributor writes and owns their article on their own PDS; the Owner reviews submissions and approves or rejects them into their site's manifest. Full reasoning, alternatives considered, and consequences for each decision below live in the ADRs — this document is the phased build plan, not a restatement of the design. Read the ADRs before starting any phase.

Phases are ordered by hard dependency, not by size — each phase after the first requires the one(s) before it to exist. Within that constraint, run a `/grill-with-docs` session per phase before implementing it.

### Phase 1 — Foundational roster

**Depends on:** nothing; this is the prerequisite for every other phase.

**Grilled 2026-07-15 — see ADR 0019 for everything that changed from the original ADR 0014/0015/0018 sketch.** The scope below is the settled result, not the original draft.

**Scope:**

*Schema:*
- `scribe.contributors: [{did, addedAt, status}]` array on `site.standard.publication`, in the `scribe` extension object — `status: "invited" | "accepted" | "rejected"` (ADR 0019, amending ADR 0018's flat-list sketch; the "no role field" decision in ADR 0018 was about permission tiers, not this lifecycle field — still no permission-scoped role anywhere in the roster).
- `contributor_memberships (contributor_did, site_uri, added_at, status)` local table (ADR 0015 + ADR 0019) — `status` mirrors the roster entry, kept in lock-step at all three transitions (invite / accept / reject) so a Contributor's own login can answer "what's pending for me?" without re-reading the actual site record.

*Owner-side UI — lives on `/article/list/:siteSlug`, not `configure` (keeps all per-site people-and-content management on one page; this is also where Phase 5's chat panel will land):*
- Route's `PageContainer` gains the `fixed` prop to enlarge the page. The existing two `PageSection`s (site title, group list) get consolidated so exactly one of them (the group list) uses `overflow`, since `fixedPageContainer` clips (`overflow: hidden`) rather than scrolling by default — without this, the page just clips instead of scrolling once the new Contributors section pushes it past viewport height. Single scrolling column for Phase 1 — no `PageSectionColumns` split yet; that's a Phase 5 concern when the chat panel actually exists.
- A new Contributors section listing the roster (handle, avatar, status Pill, Remove button per entry).
- `topButtons` gains a second sibling alongside the existing `ButtonGroupContainer` (Draft New Article / Add New Group) — a right-aligned "Invite Contributor" button. `topButtonPanel` already lays out with `justify-content: space-between`, so this falls out for free once there are two top-level children instead of one.
- "Invite Contributor" opens a modal: handle input resolves to a DID via the existing `/article/resolve-contributor` route (same lookup already shipped for the document-level byline feature, `AddContributorModal` — reuse the pattern, not a second lookup flow). "Send Invite" is disabled until a profile resolves and is not already on the roster; submitting writes the `scribe.contributors` entry (`status: "invited"`) and the `contributor_memberships` row in one action, then sends the invite DM.
- Rejected-entry cleanup runs in this route's own loader: on every load, any roster entry with `status: "rejected"` gets removed from `scribe.contributors` (and its `contributor_memberships` row deleted) — the concrete instantiation of "next Owner login" from ADR 0014's reconciliation pattern, made specific to the one page that displays roster state.

*Invite DM (ADR 0019 — does not route through `scribe-atp-social`):*
- Sent directly from the Owner's own CMS OAuth session via `chat.bsky.convo.getConvoForMembers` + `sendMessage` (same two calls `scribe-atp-social`'s `notify.ts` already makes for subscriber alerts, just executed in-process against the Owner's own agent instead of that service's fixed bot identity) — keeps `scribe-atp-social` scoped to anonymous engagement events only, per ADR 0015.
- Message: "Hi {displayName}, I'd like to invite you to contribute to {site URL}. Please click here ({app root URL}) and login to accept the invite." Link carries no identifying parameter — see next point for why.
- Requires adding two scopes to `OAUTH_SCOPE` **in this phase**, not Phase 5 as ADR 0016 originally scoped it (ADR 0019) — every existing user must re-authenticate before Phase 1 ships. Implemented as `rpc:chat.bsky.convo.getConvoForMembers?aud=did:web:api.bsky.chat#bsky_chat` and the `sendMessage` equivalent, per atproto.com's service-proxied-lexicon scope syntax (not the legacy `transition:chat.bsky`, which doesn't fit this app's existing fine-grained `repo:` scope style). **Not yet verified against a real Bluesky re-authentication** — dev-bypass mode never exercises the OAuth path, so whether `#` needs literal or `%23`-encoded form in the scope string is still open; see ADR 0019's Consequences.

*Invitee-side Accept/Reject (ADR 0019):*
- A global, on-any-authenticated-page check (not a dedicated route) reads `contributor_memberships` for `status: "invited"` rows against the logged-in DID and surfaces an Accept/Reject modal — "You have been invited to contribute articles to {Site URL}." This works whether the invitee arrives via the DM link or logs in organically later, since no state needs to travel through the link itself.
- Accept/Reject is recorded by the invitee's own session in the local `contributor_memberships` row only (their session cannot write the Owner's `site.standard.publication` record directly — the same cross-repo asymmetry ADR 0014 established for submissions). Reject is what the Owner-side loader cleanup (above) later reconciles away.

**Explicitly out of scope for this phase:** anything about submitting, reviewing, or publishing an article — this phase only makes someone a Contributor and lets them (and the Owner) discover that fact. There is nothing for a Contributor to *do* yet at the end of this phase. Self-service "leave a site" (Contributor-initiated removal) is also out of scope — Phase 1 removal is Owner-only.

**Reference:** ADR 0014 (Context, for `scribe.contributors`'s shape and why it's per-site not a separate Team entity), ADR 0015 (for `contributor_memberships` and the general discovery-index rationale), ADR 0018 (for why there's no permission-tiered role field), **ADR 0019 (for the status field, the DM mechanics, and the OAuth scope timing — read this one first, it supersedes specifics in the other three).**

### Phase 2 — Image Library site-scoped folders

**Depends on:** Phase 1 (needs the roster to exist and the add/remove action to sync from).

**Scope:**
- `image_folders.site_uri` new nullable owner column, alongside the existing `user_did`.
- `site_rosters (site_uri, member_did)` table in the Image Service's own SQLite, wholesale-replaced by a new sync call.
- New Image Service endpoint (e.g. `PUT /api/image-service/site-roster`), called from the same CMS action that writes `scribe.contributors` in Phase 1 — reuses the existing session-cookie-forwarding auth already used by `browseImages`, not a new shared secret.
- Access-check changes to the Image Service's existing read/write endpoints: allow if caller is the folder's `user_did`, or — for a site-owned folder — the site's owner (parseable directly from `site_uri`, no lookup needed) or a row in `site_rosters`.

**Explicitly out of scope:** any change to personal (`user_did`-owned) folder behavior, and the general Image Library read-access-control gap for personal folders (tracked separately, not part of Contributors).

**Reference:** ADR 0017 in full.

### Phase 3 — Submission core flow

**Depends on:** Phase 1. Does not depend on Phase 2.

**This is the largest and riskiest phase — most of the new cross-repo-write logic in the whole feature lives here.** Consider splitting the grill session itself into sub-passes (submit → review/approve/reject → Contributor-side reconciliation) rather than one pass over all of it, given how much subtlety is concentrated here (ADR 0014's Decision section documents all of it).

**Scope:**
- Contributor-side submit action: writes `scribe.pendingPublish: { siteUri, submittedAt }` on the Contributor's own document, and a `pending_submissions` row (ADR 0015's table).
- The unified Publish/Submit modal (`<optgroup>`-grouped Site dropdown — Owned Sites vs. Contributor Sites; Group dropdown for an owned site, unchanged; an inline confirmation box in the same position for a Contributor site; the confirm button's label flipping between "Publish" and "Submit for Review"). Requires extending `Select` to support grouped options, and changing the confirm button's disabled-state logic to not require a group when a Contributor Site is selected.
- The review screen — a new route, sibling to `/article/view` but reading a *specific* Contributor's document by public URI rather than the logged-in user's own repo.
- Approve action: extends `publishArticleToGroup` (or a sibling) to build the `ArticleRef` snapshot from the externally-read document; posts an outcome message to the site's chat (Phase 5, if built — treat as optional/no-op until then).
- Reject action: asks for a reason, writes it onto the `pending_submissions` row (`status: 'rejected'`), same optional chat post.
- The Contributor-side reconciliation check: on the Contributor's own session, for each of their documents still carrying `scribe.pendingPublish`, a public read of the target site's manifest to detect approval (triggering the finalizing write — `site`/`path`/`scribe.domain`/`scribe.canonicalUrl`/`publishedAt`/the dedup-guarded `Publisher` contributor-array credit) or a persisted `pending_submissions` rejection row (triggering the reject-side cleanup).

**Explicitly out of scope:** toasts and badges (Phase 4) — this phase can ship with a plain, un-decorated submissions list on the site management page; chat integration (Phase 5) — approve/reject can no-op the chat post until Phase 5 exists.

**Reference:** ADR 0014 in full (this phase *is* ADR 0014's Decision section), ADR 0015 for the `pending_submissions` shape.

### Phase 4 — Discovery UX polish

**Depends on:** Phase 3 (needs `pending_submissions` and `contributor_memberships` populated by real data to be meaningful).

**Scope:**
- Owner-side non-expiring toast per new submission (`autoExpire: false`), one per submission not aggregated, client-side dedup against re-showing the same one twice in a session, dismiss purely cosmetic.
- The "requires attention" badge cascade: `AsideMenu`'s Sites icon, the `/sites` page, and the "New Article Submission" section on the per-site management page (hidden entirely when empty, matching the existing conditional-section pattern already used for Standalone Articles).
- Contributor-side toast on the same reconciliation check from Phase 3 (approved / rejected-with-reason), linking to the per-site page.

**Reference:** ADR 0015 in full.

### Phase 5 — Team chat

**Depends on:** Phase 1 only (needs a roster to resolve `getConvoForMembers` against). Independent of Phases 2–4; genuinely optional relative to the rest of the feature — the submission workflow (Phase 3) functions completely without this.

**Scope:**
- ~~New `chat.bsky.convo.*` OAuth scope added to `OAUTH_SCOPE`~~ — **already added in Phase 1** (ADR 0019, for the invite DM) — no second re-authentication event needed here, Phase 5 just reuses the scope Phase 1 already forced.
- Inline chat panel on the per-site management page, always resolved fresh via `getConvoForMembers(currentRoster)` — explicitly not chaining old conversations together across roster changes (ADR 0016's central decision — re-read the Context/Decision before touching this).
- Polling for new messages (interval TBD during implementation, with cleanup-on-unmount and ideally pause-when-unfocused), sender resolution (DID → displayName/avatar), timestamps, own-vs-others styling, send-failure states, pagination.

**Reference:** ADR 0016 in full, including the two accepted limitations (history fragmentation on roster change, imperfect revocation) — these are decided, not open questions to re-litigate during the grill session for this phase. ADR 0019 supersedes ADR 0016's OAuth-scope-timing consequence specifically.

## MIGRATION: standard.site Article Lexicon Adoption

### Status: In Progress — SDK published (v2.0.0); CMS write paths updated; CMS-09 through CMS-14 (publish flow, canonical site modal, path maintenance, migration tool) pending

### Decision

Migrate `app.scribe.article` records to the `site.standard.document` lexicon defined by [standard.site](https://standard.site), while retaining `app.scribe.site` unchanged.

The `site.standard.document` lexicon is the emerging community standard for long-form publishing on AT Protocol, adopted by Leaflet, Pckt, Offprint, and the WordPress ATmosphere plugin. Migrating articles makes Scribe content discoverable by any aggregator or reader that speaks standard.site, with no changes to the grouping/ordering structure that `app.scribe.site` provides.

`app.scribe.site` is deliberately retained because `site.standard.publication` (the standard.site equivalent) has no concept of grouping, ordering, or manifests. The entire value of the site record — named groups, article ordering, published/unpublished state — has no counterpart in the standard.site spec. Adopting standard.site for the site record would require gutting these features.

### Background: how standard.site works

standard.site defines two core lexicons:

- **`site.standard.publication`** — a minimal site record (url, name, description, icon, theme, discovery preferences)
- **`site.standard.document`** — an article/document record with a required `site` field pointing to its publication

The relationship is **document-centric**: documents reference their publication; the publication has no list of documents. To fetch all documents for a publication, a reader scans the author's entire `site.standard.document` collection and filters by the `site` field. There is no manifest, no defined ordering mechanism, and no grouping concept — these are left to individual platforms and aggregators.

This is the fundamental reason `app.scribe.site` is retained: standard.site deliberately does not solve the structured ordering and grouping problem that Scribe's site manifest solves.

### Field mapping: app.scribe.article → site.standard.document

| Scribe field | Type | standard.site field | Type | Action |
|---|---|---|---|---|
| `title` | string | `title` | string | No change |
| `synopsis` | string | `description` | string | Rename |
| `updatedAt` | datetime | `updatedAt` | datetime | No change |
| `createdAt` | datetime | `publishedAt` | datetime | Rename; semantic shifts slightly (creation time used as publish time) |
| `url` (slug) | string | `path` | string | Rename; value stays the same (the slug) |
| `content` (HTML) | string | `content` | open union | Wrap in `app.scribe.content.html` type (see below) |
| `splashImageUrl` | string (URL) | `coverImage` | blob | **Not migrated** — standard.site expects a blob stored in the PDS; Scribe uses hosted URLs. Retain as Scribe extension field. |
| — | — | `site` | string (required) | Populate with the `https://` URL of the first assigned site. Unresolved for draft articles — see open questions. |
| — | — | `textContent` | string | Generate by stripping HTML from `content` on write. Provides a plaintext fallback for standard.site aggregators. |

Fields present in `site.standard.document` but not planned for adoption: `tags`, `bskyPostRef`, `links`, `labels`, `contributors`. These can be adopted incrementally in future without any breaking change.

### Field mapping: app.scribe.site → site.standard.publication

This migration is **not planned**. For reference:

| Scribe field | standard.site field | Notes |
|---|---|---|
| `url` | `url` | Direct match |
| `title` | `name` | Rename only |
| `description` | `description` | Direct match |
| `logoImageUrl` | `icon` | Type mismatch (URL vs blob) |
| `splashImageUrl` | — | No equivalent |
| `urlPrefix` | — | No equivalent |
| `groups` | — | **No equivalent — entire grouping structure** |
| `ungroupedArticles` | — | **No equivalent — draft/unpublished state** |
| `contributors` | — | No equivalent at publication level |
| `createdAt` / `updatedAt` | — | No equivalent |

### app.scribe.content.html

A new content type to be defined (and eventually published as a formal lexicon) for use in the `content` open union field of `site.standard.document`. The `content` field in standard.site is deliberately open — it has no built-in content types. Different platforms define their own (e.g. `markpub.at` defines `at.markpub.markdown` for Markdown content).

Shape:
```json
{
  "$type": "app.scribe.content.html",
  "html": "<p>Article body as serialised HTML.</p>"
}
```

The SDK extracts the HTML from this wrapper transparently, so consumer sites and the reader see no change in the data they receive.

### ArticleRef URI changes in app.scribe.site

`app.scribe.site` stores article refs with AT URIs in the form:
```
at://did:plc:xyz/app.scribe.article/my-article-slug
```

After migration these become:
```
at://did:plc:xyz/site.standard.document/my-article-slug
```

The rkey (slug) is unchanged. The site manifest structure, group ordering, and all other fields are untouched — only the collection name in the URI changes. The migration script handles this rewrite.

### What changes in each repo

**`scribe-atp-sdk` (`@scribe-atp/core`) — major version bump**
- Collection name: `app.scribe.article` → `site.standard.document` in all fetch calls
- Type field renames: `synopsis` → `description`, `url` → `path`, `createdAt` → `publishedAt`
- `content` handling: extract HTML from `app.scribe.content.html` union wrapper transparently
- `Article` type updated to reflect new field names
- SDK version: major bump (breaking change for any consumer referencing field names directly)

**`scribe-atp.app` (CMS) — write paths, scopes, migration tool**
- `ARTICLE_COLLECTION` constant: `app.scribe.article` → `site.standard.document`
- `SCRIBE_COLLECTIONS` in nuke tool updated
- OAuth scopes: `repo:app.scribe.article?action=*` → `repo:site.standard.document?action=*` (users must re-authenticate)
- Write paths (`create.tsx`, `edit.tsx`): wrap content in `app.scribe.content.html`; generate `textContent` by stripping HTML; populate `site` field with assigned site's `https://` URL
- ArticleRef field renames propagated through `buildArticleRef`, `nodeFromRef`, `articleRefFromNode`
- Migration tool: one-time protected route (similar to the nuke tool on the home page) — see Migration Script section below

**`norobots`, `perpetual-summer-ltd`, `anthonycregan.co.uk-2025`, `scribe-atp-reader` — low touch**
- `npm update @scribe-atp/core` / `pnpm update @scribe-atp/core`
- Any direct field references (`article.synopsis`, `article.url`, `article.createdAt`) need renaming to match new field names — TypeScript compiler will surface these at `npm update` time

### Migration script

A one-time protected route in the CMS (e.g. `/migrate/articles`), accessible only to authenticated users, similar to the existing nuke tool. Not a standalone script — uses the existing `requireAtpAgent` infrastructure.

**Steps the script performs:**

1. Fetch all `app.scribe.article` records from the PDS
2. Fetch all `app.scribe.site` records to build a map of `articleUri → siteUrl[]`
3. For each article:
   - Map fields to `site.standard.document` shape (renames, content wrapping, textContent generation)
   - Populate `site` field: use `https://` URL of the first site the article belongs to; skip (leave as `app.scribe.article`) if unassigned — see open questions
   - `createRecord` on `site.standard.document` collection with the **same rkey** (slug is preserved)
4. For each `app.scribe.site` record:
   - Rewrite all ArticleRef `uri` fields: replace `/app.scribe.article/` with `/site.standard.document/` in the AT URI string
   - `putRecord` the updated site manifest
5. `deleteRecord` for all original `app.scribe.article` records

The script should display a dry-run summary (counts of articles to migrate, sites to update, draft articles that will be skipped) before executing, and report success/failure per record.

### Release sequence

```
Phase 1 — Build (parallel workstreams)
  SDK:  feature branch → implement type changes, content union, new collection name → major version bump
  CMS:  feature branch → update write paths, scopes, content wrapping, textContent → build migration tool

Phase 2 — Coordinated release day
  1. Deploy updated CMS (writes new articles as site.standard.document from this point)
  2. Run migration tool once — migrates all existing PDS records, updates site manifests
  3. Verify: existing consumer sites still resolve articles (old SDK reads app.scribe.article which still exists briefly)
  4. Publish updated SDK (major version)
  5. npm update / pnpm update on all consumer sites and reader
  6. Deploy consumer sites and reader
  7. Re-authenticate in CMS (scope change forces new OAuth consent)

Phase 3 — Verify
  - Existing articles readable by consumer sites and reader
  - Site manifests resolve correctly (updated URIs)
  - New articles written as site.standard.document
  - No app.scribe.article records remain on PDS
```

**Critical ordering constraint:** the migration tool must run and complete before the new SDK is deployed to consumer sites. Consumer sites using the old SDK can still read `app.scribe.article` records that exist briefly in parallel. Once the migration is complete and old records are deleted, consumer sites must be on the new SDK.

### Open questions and unresolved decisions

These are the points that need resolution before implementation begins. A grill session on this plan should work through each one.

---

**1. Draft articles and the required `site` field**

`site.standard.document` requires every record to have a `site` field. Draft articles in Scribe — those on the PDS but not referenced in any site manifest — have no site to point at.

Options:
- **Skip drafts in migration** — leave unassigned articles as `app.scribe.article` until they are assigned to a site. The CMS would then write them as `site.standard.document` (with a `site` value) on first site assignment. Clean semantic line: a `site.standard.document` is something that belongs to a publication; a draft genuinely doesn't yet. Requires the CMS to handle two collection names temporarily.
- **Create a "drafts" publication** — create a `site.standard.publication` (or `app.scribe.site`) record representing "drafts" and point unassigned articles at it. A workaround that doesn't reflect the actual intent of the field.
- **Drop the standalone draft concept** — require every article to be assigned to a site from creation. Simplifies the model but changes the authoring workflow significantly.
- **Use a placeholder `https://` URL** — populate `site` with the author's primary domain or a generic URL. Technically valid per the spec but semantically misleading.

**Decision needed:** which of these is acceptable, and what happens to articles that are currently unassigned on the PDS at migration time?

---

**2. Multi-site articles and the singular `site` field**

`site.standard.document`'s `site` field is a single string. Scribe allows one article to appear in multiple sites (it appears in multiple site manifests). The standard.site model has no way to express multiple publication memberships on the document record itself.

Options:
- **Use the first assigned site** — nominate one as the canonical publication. The `links` field (open union) on `site.standard.document` could potentially express secondary associations, but this is non-standard.
- **Accept the limitation** — for external consumers, the article appears to belong to one publication only. Internal Scribe behaviour (multi-site) is unaffected because membership is governed by the `app.scribe.site` manifests, not the document record.

**Decision needed:** is multi-site article assignment a feature worth preserving in the standard.site field, or is the `app.scribe.site` manifest the authoritative source for that and the `site` field on the document is just "primary publication"?

---

**3. splashImageUrl vs coverImage**

standard.site's `coverImage` is a blob — stored directly in the PDS. Scribe uses hosted URLs pointing at the Image Service. These are architecturally incompatible without a significant storage model change.

Current plan: retain `splashImageUrl` as a Scribe extension field on the `site.standard.document` record and do not populate `coverImage`. AT Protocol lexicons are extensible with additional fields beyond the spec.

**Question:** is this acceptable long-term? Aggregators and readers that support `coverImage` will not see Scribe article splash images. Could become relevant if standard.site adoption grows and cover image display becomes common. The alternative (storing images as PDS blobs) is a significant architectural change and likely not worth it.

---

**4. Publishing app.scribe.content.html as a formal lexicon**

Using `app.scribe.content.html` as a `$type` in the content union does not require a published lexicon — any `$type` string is valid in an open union. However, publishing it formally would:
- Document the HTML content type for other tools that may want to render Scribe articles
- Establish Scribe's contribution to the standard.site ecosystem
- Be required if the type is ever to be used by third parties

**Decision needed:** publish the content type lexicon before migration (making it official from day one) or after (when there is more certainty about the shape)? Where does it live — `scribe-atp-sdk` repo, a dedicated `scribe-atp-lexicons` repo, or elsewhere?

---

**5. The grouping lexicon — longer-term question**

standard.site has no grouping concept. If Scribe's grouping approach were published as a formal lexicon (e.g. `app.scribe.group`), it could potentially become a contribution to the wider ecosystem — other platforms could adopt it for structured ordered content.

This is explicitly deferred and not part of this migration. It requires a separate design session because the document-centric model makes grouping significantly more complex than the manifest approach. Questions that would need resolving:
- Does a group record embed an ordered list of document URIs, or do documents reference a group?
- How is ordering expressed in a document-centric model?
- Is the grouping lexicon meant to be adopted by other platforms, or is it Scribe-specific?
- Would publishing a grouping lexicon eventually make `app.scribe.site` redundant?

**Not blocked on:** the article migration can proceed without resolving the grouping lexicon question.

---

**6. Eventual migration of app.scribe.site**

Even if `app.scribe.site` is retained now, should there be a long-term plan to migrate it to `site.standard.publication` and express the grouping structure via a published Scribe lexicon? Or is `app.scribe.site` the permanent home for the structured manifest?

This is a strategic question about whether Scribe is positioning itself as a standard.site-compatible platform or as a parallel ecosystem. The article migration is a step toward the former; retaining `app.scribe.site` permanently is a step toward the latter.

---

### Decisions resolved (grill session, 2026-06-24)

All six open questions above were resolved. Key decisions:

| Question | Decision |
|---|---|
| Draft schema | **Option 2** — drafts in `app.scribe.article` use `site.standard.document` field shape from creation. `site` and `publishedAt` fields are absent on drafts. See ADR 0008. |
| `site` field value | `https://` URL of the Canonical Site — `https://{url}` or `https://{url}/{urlPrefix}` if a prefix is set. |
| Canonical Site | Author nominates via modal when publishing to multiple sites; auto-selected when single site; editable after publish. New term — see `UBIQUITOUS_LANGUAGE.md`. |
| `path` field | `/{group-slug}/{article-slug}` when in a named group; `/{article-slug}` when ungrouped. Updated on group moves. |
| `publishedAt` | Set at actual publish instant. Absent on drafts. Migration: set to old `createdAt` as best approximation. See ADR 0009. |
| `textContent` | CMS strips HTML on every write. SDK reads stored value. |
| SDK public API | Full rename to standard.site names — no backward-compat shims. Major version bump. |
| ArticleRef renames | `url`→`slug`, `synopsis`→`description`, add `tags?`, add `publishedAt?`. |
| CMS collection routing | Edit route tries `site.standard.document` first, falls back to `app.scribe.article`. |
| OAuth scopes | Both collections needed. User re-authenticates once. |
| Migration approach | User pre-clears all drafts (moves to a site), then triggers migration from CMS dev tool. Verification gate blocks if any `app.scribe.article` record is not in a site manifest. |
| Multi-site canonical | Auto-nominate alphabetically by site URL during migration; log for user review. |
| Tags | Follow-on feature — not in migration scope. |
| `splashImageUrl` | Retained as Scribe extension field. `coverImage` (blob) not adopted. |

---

### Implementation Tickets

#### `scribe-atp-sdk` — `@scribe-atp/core`

**SDK-01 Update `ArticleRef` type**

File: `packages/core/src/types.ts`

- Rename `url` → `slug` (optional)
- Rename `synopsis` → `description` (optional)
- Add `publishedAt?: string`
- Add `tags?: string[]`
- Keep `uri`, `title`, `splashImageUrl`, `createdAt`, `updatedAt` unchanged

```ts
export interface ArticleRef {
  uri: string;
  title: string;
  slug?: string;
  splashImageUrl: string | null;
  description?: string | null;
  tags?: string[];
  createdAt: string;
  publishedAt?: string;
  updatedAt?: string;
}
```

**SDK-02 Update `Article` type**

File: `packages/core/src/types.ts`

- Rename `url` → `path`
- Rename `synopsis` → `description`
- Add `site: string` (Canonical Site `https://` URL)
- Add `publishedAt: string`
- Keep `title`, `content` (HTML string — extracted from union by SDK), `splashImageUrl`, `createdAt`, `updatedAt` unchanged

```ts
export interface Article {
  title: string;
  content: string;        // HTML — extracted from app.scribe.content.html union
  path: string;
  site: string;
  splashImageUrl?: string;
  description?: string;
  createdAt: string;
  publishedAt: string;
  updatedAt: string;
}
```

**SDK-03 Update `fetchArticle`**

File: `packages/core/src/fetch.ts`

- Change collection from `"app.scribe.article"` to `"site.standard.document"`
- Extract HTML from `app.scribe.content.html` content union:
  ```ts
  const html = record.content?.$type === "app.scribe.content.html"
    ? record.content.html
    : typeof record.content === "string" ? record.content : "";
  ```
- Map all renamed fields

**SDK-04 Update `listArticles`**

File: `packages/core/src/list.ts`

- Change collection to `"site.standard.document"`
- Records without `publishedAt` are drafts — filter them out if they appear (should not after migration, but defensive)

**SDK-05 Update `generateFeed`**

File: `packages/core/src/feed.ts`

- `synopsis` → `description` for item description
- `createdAt` → `publishedAt` for item pub date
- `url` → `slug` for item URL construction (ArticleRef)
- `article.url` → `article.path` for full article URL

**SDK-06 Update `getSitemapEntries`**

File: `packages/core/src/sitemap.ts`

- `ArticleRef.url` → `ArticleRef.slug` for URL construction
- `article.url` → `article.path` if fetching full articles

**SDK-07 Update all package tests**

- `packages/core/src/*.test.ts` — new collection name in mock responses, new field names
- `packages/react/src/*.test.ts` — field name references
- `packages/angular/src/*.test.ts` — field name references
- `packages/vue/src/*.test.ts` — field name references
- `packages/nuxt/src/*.test.ts` — field name references

**SDK-08 Major version bump and changelog**

- `npx changeset` — select all packages, bump type: **major**
- `npx changeset version` — updates `package.json` versions
- Verify `CHANGELOG.md` entries are correct
- Commit: `chore: version packages — major bump for standard.site migration`

---

#### `scribe-atp.app` — CMS

**CMS-01 Update collection constants**

File: `app/constants.ts`

- Add `DOCUMENT_COLLECTION = "site.standard.document"` (published articles)
- Rename `ARTICLE_COLLECTION` → keep `ARTICLE_COLLECTION` but change value to `"site.standard.document"` for all external consumers, OR rename to `DRAFT_COLLECTION = "app.scribe.article"` for draft usage
- Recommended approach: keep `ARTICLE_COLLECTION = "site.standard.document"` as the primary constant (what consumers mean by "article collection"), and add `DRAFT_COLLECTION = "app.scribe.article"` for draft-specific code

Update all importers of `ARTICLE_COLLECTION`. After this change:
- `ARTICLE_COLLECTION` = `"site.standard.document"` — published records
- `DRAFT_COLLECTION` = `"app.scribe.article"` — draft records
- `SITE_COLLECTION` = `"app.scribe.site"` — unchanged

**CMS-02 Update OAuth scopes**

File: `app/services/auth.server.ts`

Add to `OAUTH_SCOPE`:
```
repo:site.standard.document?action=create
repo:site.standard.document?action=update
repo:site.standard.document?action=delete
```

Keep all `app.scribe.article` scopes — still needed for draft CRUD.

Note: users must revoke at https://bsky.social/account and re-authenticate to get the new scopes. This is a one-time action; plan it alongside the CMS deployment.

**CMS-03 Update `app/hooks/types.ts`**

- `ArticleRef`: rename `url`→`slug`, `synopsis`→`description`, add `publishedAt?: string`, add `tags?: string[]`
- `Article`: rename `url`→`path`, `synopsis`→`description`, add `site: string`, add `publishedAt: string`

This is the CMS's canonical type definition file. All downstream TypeScript errors will surface from this change — follow the compiler.

**CMS-04 Update draft write path (create.tsx)**

When creating a new draft, write to `DRAFT_COLLECTION` (`app.scribe.article`) using `site.standard.document` field shape:

- Field `path` (not `url`) = article slug
- Field `description` (not `synopsis`) = synopsis text
- Field `content` = `{ $type: "app.scribe.content.html", html: "<p>...</p>" }`
- Field `textContent` = HTML stripped to plaintext (strip tags, decode entities, collapse whitespace)
- Field `createdAt` = `new Date().toISOString()` — extension field, set once
- **No** `site` or `publishedAt` fields on drafts

HTML stripping for `textContent`:
```ts
import { isomorphicDomPurify } from "isomorphic-dompurify";
function toPlainText(html: string): string {
  // Strip tags, decode entities, collapse whitespace
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
```

**CMS-05 Update `buildArticleRef` in `article.server.ts`**

- Rename `url`→`slug` in the output
- Rename `synopsis`→`description` in the output
- Add `publishedAt?: string` parameter and field
- Field names must match `ArticleRef` from `app/hooks/types.ts`

**CMS-06 Update `nodeFromRef`/`articleRefFromNode` in `siteTree.ts`**

- `ref.url` → `ref.slug`
- `ref.synopsis` → `ref.description`
- `node.url` → `node.slug`
- `node.synopsis` → `node.description`
- Add `publishedAt` to both sides of the mapping

This is the single field-mapping seam between `ArticleRef` and `TreeArticleNode`. The round-trip test in `siteTree.test.ts` will catch any missed fields.

**CMS-07 Update `ArticleForm` component**

File: `app/components/ArticleForm/ArticleForm.tsx`

- Prop `defaultSynopsis`→`defaultDescription` (or whatever the current prop name is — check the component)
- Internal field name `synopsis`→`description` in the form inputs
- The URL slug field stays as-is in the UI — the label and behaviour are unchanged; the record field just changes from `url` to `path`

**CMS-08 Update edit route to try `site.standard.document` first**

File: `app/routes/article/edit/edit.tsx`

The loader currently fetches by `articleUrl` param from `ARTICLE_COLLECTION`. Update to:

1. Try `getRecord` from `ARTICLE_COLLECTION` (`site.standard.document`) using the slug as rkey
2. On 404, try `getRecord` from `DRAFT_COLLECTION` (`app.scribe.article`)
3. Map fields from whichever succeeds — both now use the same field names (ADR 0008)

The action (save) should write back to whichever collection the record was found in. If the record is in `DRAFT_COLLECTION` and the user clicks Publish, that triggers the publish flow (CMS-09).

**CMS-09 Implement publish flow**

This is the core lifecycle transition: Draft → Published.

Publishing an article:
1. Build the `site.standard.document` record:
   - All fields from the draft (`app.scribe.article` record)
   - Add `site`: `https://${canonicalSite.url}${canonicalSite.urlPrefix ? `/${canonicalSite.urlPrefix}` : ""}`
   - Add `publishedAt`: `new Date().toISOString()`
2. `createRecord` on `site.standard.document` with the **same rkey** (slug)
3. `deleteRecord` on `app.scribe.article` (the draft)
4. Update `app.scribe.site` manifest: the article ref URI changes from `at://did/.../app.scribe.article/slug` to `at://did/.../site.standard.document/slug`

**Entry points that trigger publish:**
- Create route: "Assign to site + publish" action (currently unclear — check current flow)
- `site-list.tsx`: `_intent=publishArticle` (moves from `ungroupedArticles` to a named group)

Wait — re-examine: under the new model, "Unpublished" means the article is in `site.standard.document` but in `ungroupedArticles`. "Draft" means it's in `app.scribe.article` with no site. The transition Draft→Unpublished = publish (adds `site` + `publishedAt`). The transition Unpublished→Published = assign to a named group (pure site manifest change, no record move).

So `_intent=publishArticle` in `site-list.tsx` triggers the Draft→Unpublished transition (record move + manifest update). `_intent=moveToDraft` triggers Unpublished→Draft (create `app.scribe.article` from the `site.standard.document` record, delete the `site.standard.document` record, remove from manifest).

**CMS-10 Add Canonical Site nomination modal**

When an article is published to exactly one site: canonical site is auto-selected — no modal needed.

When published to more than one site: show a modal prompting the author to select which site is the Canonical Site. The modal fires as part of the publish action.

UI: a simple single-select list of the assigned sites with a "Set as Canonical Site" heading. Default highlight: first alphabetically by domain. The result sets the `site` field on the `site.standard.document` record.

Post-publish: the article's edit page should show the current Canonical Site with an "Edit" button that allows changing it (fires a `putRecord` updating the `site` field).

**CMS-11 Update `path` field on group moves**

File: `app/routes/article/site-list/site-list.tsx`

When `_intent=publishArticle` (Draft→Unpublished) is called with a `targetGroupSlug`:
- Set `path` = `/${targetGroupSlug}/${articleSlug}` on the `site.standard.document` record

When `saveSite` saves a reordered tree (drag-and-drop move between groups):
- For any article that has moved to a different group (compare old tree to new tree)
- Update `path` on the `site.standard.document` record to reflect new group

When `_intent=moveToDraft` (article returns to `app.scribe.article`):
- `path` on the new draft record = `/${articleSlug}` (ungrouped, no group prefix)

This path maintenance ensures the `path` field on PDS records stays accurate for standard.site aggregators.

**CMS-12 Simplify draft/orphan detection**

The home page and `/article/list` loader currently do:
- Fetch all `app.scribe.article` records
- Fetch all `app.scribe.site` records
- Build a Set of all referenced AT URIs from all site manifests
- Diff against `app.scribe.article` URIs to find orphans ("Unassigned Articles")

After migration, **all `app.scribe.article` records are drafts by definition**. The diff is unnecessary. Replace with:

```ts
const { records: drafts } = await agent.com.atproto.repo.listRecords({
  repo: did,
  collection: DRAFT_COLLECTION,
});
// drafts = all draft articles — no diffing needed
```

The "Unassigned Articles" section on the home page / list becomes "Draft Articles". The delete action remains — it deletes the `app.scribe.article` record.

**CMS-13 Update Nuke tool**

File: `app/routes/home/home.tsx`

```ts
const SCRIBE_COLLECTIONS = [
  "app.scribe.article",
  "site.standard.document",
  "app.scribe.site",
];
```

**CMS-14 Build migration tool**

New protected route: `/devtools/migrate-articles` (or similar, gated behind `requireAuth` + a dev-only guard).

**Verification gate (pre-flight check):**
1. Fetch all `app.scribe.article` records
2. Fetch all `app.scribe.site` records
3. Build set of all article URIs referenced in any site manifest
4. If any `app.scribe.article` URI is NOT in the set → block execution, list the unassigned articles

The user must manually move or delete all drafts before the migration can proceed.

**Dry-run display:**
- Count of articles to migrate
- Count of site manifests to update
- List of multi-site articles and their auto-nominated canonical site (alphabetically by domain)
- Warning: "publishedAt will be set to createdAt for all migrated articles (best approximation)"

**Execution (triggered by "Run Migration" button after dry-run):**

```
For each app.scribe.article record:
  1. Build site.standard.document record:
     - title, description, path, textContent, splashImageUrl (extension), createdAt (extension)
     - content: { $type: "app.scribe.content.html", html: record.content }
     - textContent: strip HTML from content
     - publishedAt: record.createdAt  (best approximation for migrated articles)
     - site: https:// URL of canonical site
       - If article is in exactly one site: use that site
       - If article is in multiple sites: use alphabetically first by domain URL
     - path: /{group-slug}/{article-slug} or /{article-slug} if ungrouped
       (derive from the canonical site manifest — find which group the article is in)
  2. createRecord on site.standard.document (same rkey)
  3. Log success/failure

For each app.scribe.site record:
  4. Rewrite all ArticleRef URIs: app.scribe.article → site.standard.document
  5. Rename ArticleRef fields: url→slug, synopsis→description
  6. putRecord the updated site manifest
  7. Log success/failure

For each successfully migrated app.scribe.article record:
  8. deleteRecord

Display: per-record progress and final summary.
```

**CMS-15 Update unit tests**

- `siteTree.test.ts` — update ArticleRef fixtures to use `slug`, `description`; update expected outputs
- `article.server.ts` tests (if any) — update mock data
- Component tests that reference `synopsis`, `url` on article types

**CMS-16 Update E2E tests**

Review all E2E specs for field name references:
- `e2e/create-article.spec.ts`
- `e2e/edit-article.spec.ts`
- `e2e/article-list.spec.ts`
- `e2e/site-management.spec.ts`

Also add E2E coverage for the publish flow (Draft→Unpublished, Unpublished→Published via group assign).

**CMS-17 Update `CLAUDE.md`**

- AT Protocol collections section: update `app.scribe.article` schema to new field names; add `site.standard.document` as the published article collection
- `ARTICLE_COLLECTION` constant table: update value and add `DRAFT_COLLECTION`
- ArticleRef mirroring principle: update field names
- OAuth scopes section: add `site.standard.document` scopes

---

#### Consumer sites — `norobots`, `perpetual-summer-ltd`, `anthonycregan.co.uk-2025`

Each site gets one ticket. The work is identical across all three.

**SITE-01 Update `@scribe-atp/core` dependency and fix TypeScript errors**

1. `npm update @scribe-atp/core` (or `pnpm update @scribe-atp/core` for `anthonycregan`)
2. Run `npm run typecheck` — compiler will surface all field-name usages that have changed
3. Fix all TS errors — predominantly:
   - `article.url` → `article.path` in blog route components
   - `article.synopsis` → `article.description` in meta tags and article cards
   - `articleRef.url` → `articleRef.slug` in list rendering and URL construction
   - `articleRef.synopsis` → `articleRef.description` in list rendering
4. Run `npm run build` — verify no build errors
5. Deploy

**Common locations to check per consumer site:**
- `app/config/blog.ts` — no article field references, safe
- `app/routes/feed.ts` — `generateFeed` call; SDK handles field names internally
- `app/routes/sitemap.ts` — `getSitemapEntries` call; SDK handles internally
- `app/routes/blog.tsx` (and `/:groupSlug/:articleSlug`) — article data binding in JSX
- Any `<meta>` tags using `article.synopsis` or `article.url`

---

#### `scribe-atp-reader` (if exists as a separate repo)

Same as consumer site ticket — `npm update @scribe-atp/core`, fix TypeScript errors.

---

### Execution Order

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1 — Build (parallel workstreams, separate feature branches)│
│                                                                   │
│  SDK branch: SDK-01 → SDK-02 → SDK-03 → SDK-04                  │
│              SDK-05 → SDK-06 → SDK-07 → SDK-08 (version bump)   │
│                                                                   │
│  CMS branch: CMS-01 (constants)                                  │
│           → CMS-03 (types)                                       │
│           → CMS-04 (draft write path)                            │
│           → CMS-05 (buildArticleRef)                             │
│           → CMS-06 (siteTree field renames)                      │
│           → CMS-07 (ArticleForm)                                 │
│           → CMS-08 (edit route dual-collection)                  │
│           → CMS-09 (publish flow)                                │
│           → CMS-10 (Canonical Site modal)                        │
│           → CMS-11 (path maintenance on moves)                   │
│           → CMS-12 (orphan detection simplification)             │
│           → CMS-13 (nuke tool)                                   │
│           → CMS-14 (migration tool)                              │
│           → CMS-02 (OAuth scopes — can be done any time)         │
│           → CMS-15 + CMS-16 (tests)                              │
│           → CMS-17 (CLAUDE.md update)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2 — Deploy CMS (without SDK publish)                       │
│                                                                   │
│  • Deploy updated CMS to production                              │
│  • Re-authenticate (new scopes — revoke at bsky.social/account   │
│    then log in again)                                            │
│  • From this point, new articles are written as                  │
│    site.standard.document (drafts still app.scribe.article)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3 — Pre-migration prep                                     │
│                                                                   │
│  • Manually review all articles — move any true drafts           │
│    to at least one site, or delete them                          │
│  • Run dry-run from CMS migration tool (/devtools/migrate)       │
│  • Review canonical site auto-nominations for multi-site articles│
│  • Verify zero articles flagged as "unassigned" by the gate      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4 — Run migration                                          │
│                                                                   │
│  • Click "Run Migration" in CMS devtools                         │
│  • Wait for completion — verify per-record success               │
│  • Verify: all articles readable from site.standard.document     │
│  • Verify: site manifests have updated URIs                      │
│  • Verify: no app.scribe.article records remain on PDS           │
│    (aside from any new drafts created post-Phase 2)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5 — Publish SDK and update consumer sites                  │
│                                                                   │
│  • Merge SDK branch → publish to npm (manual CI job)             │
│  • SITE-01 × 3 consumer sites (+ reader if separate repo):       │
│      npm update / pnpm update                                    │
│      Fix TypeScript errors                                       │
│      Build + deploy each site                                    │
│  • Consumer sites should be deployed within the same release     │
│    window — old SDK cannot read site.standard.document records   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 6 — Verify                                                 │
│                                                                   │
│  • Each consumer site: existing articles render correctly        │
│  • RSS feeds: items have correct titles, descriptions, dates     │
│  • Sitemaps: article URLs correct                                │
│  • CMS: create a new article, publish it, verify it appears on   │
│    consumer site                                                 │
│  • CMS: edit a published article, verify changes propagate       │
│  • Bluesky/standard.site: verify article discoverable via        │
│    site.standard.document collection on PDS                      │
└─────────────────────────────────────────────────────────────────┘
```

**Critical constraint:** Phase 5 (consumer site updates) must complete in the same release window as the migration (Phase 4). Once `app.scribe.article` records are deleted, any consumer site still on the old SDK will return 404s for articles. Do not leave Phase 5 for another day.

**Not blocked on:** this can be decided after the article migration ships and the standard.site ecosystem has more time to develop a grouping story of its own.

## MIGRATION: ADR 0013 Single-Site Model (2026-07-08, COMPLETE)

**Supersedes the publish-lifecycle assumptions embedded throughout the migration above** (e.g. lines ~913–932): the three-state Draft → Unpublished (`ungroupedArticles`) → Published model, and the assumption that an Article's `site` field could legitimately be set before it's genuinely published. That model was itself the root cause of a real production bug — see `docs/adr/0013-document-site-field-is-the-loose-vs-published-signal.md` for the incident and full decision record; see `UBIQUITOUS_LANGUAGE.md`'s "Publication States" section for the corrected two-state model (**Loose** / **Published**).

Shipped in two phases on branch `feat/repair-loose-documents-devtool`, merged via MR !103:

- **Phase 1** — the ADR itself, plus the `repair-loose-documents` devtool (dry-run-then-confirm, admin-gated) to fix already-corrupted live records.
- **Phase 2** — code enforcement: `create.tsx` always creates loose (no site picker); `edit.tsx` no longer touches site assignment; a single consolidated Publish action (site → group, with inline create-group) lives on `/article/list`; `unpublishArticle` replaces `moveArticleToDraft` and fully detaches an Article back to loose in one write; the per-site view (`/article/list/:siteSlug`) lost its Publish UI entirely and only manages Groups/ordering now.

Also fixed as a direct consequence (both were dormant bugs the ADR's Consequences section predicted): `site/configure.tsx`'s domain-change cascade was comparing `doc.site` against a `https://{domain}` shape no document's `site` field can ever hold; `repairDocumentPaths.server.ts` was guarded against misreading a loose document's reader-URL `site` field as an at:// site rkey.

**Not done as part of this migration:** a live-data audit (2026-07-08) found zero multi-assigned Articles and zero data-quality issues remaining — the ADR's anticipated "fewer than 20 cross-posted articles needing manual reassignment" cleanup step turned out to be unnecessary; the loose-document repair (Phase 1) had already resolved it. The only remaining task is republishing existing loose Articles through the new Publish flow, at the site owner's discretion — a content decision, not an engineering one.
