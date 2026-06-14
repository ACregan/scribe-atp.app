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

### Image Library integration with the Lexical editor

**Inline image picker (June 2026)** — the toolbar image button (SVG icon — `SvgImageList.Image`) no longer shows an inline URL input. It opens `ImagePickerModal` (`app/components/ImagePickerModal/`), which browses the Image Library folder tree, shows image thumbnails, and on selection dispatches `INSERT_IMAGE_COMMAND` with the `max` Variant URL. Shared browser types (`BrowseFolder`, `BrowseImage`, `BrowseResponse`, helper functions) live in `imageBrowserTypes.ts` and are imported by both the picker and the `/images` route. `browseFolders(folderId?)` was added to `imageServiceClient.ts` for this purpose.

**Resizable images (June 2026)** — `ImageNode` stores `__width: number | null` (default null). Width round-trips through HTML (`style="width: Npx; max-width: 100%;"`) and Lexical JSON (`width` field, backwards-compatible). `ImageNode.decorate()` returns `<ImageResizeDecorator>` which renders left/right drag handles on hover or Lexical node selection. Drag updates local state; mouseup commits via a single `editor.update(() => node.setWidth(finalWidth))`. Minimum width: 80px. A pixel badge overlays the image during drag. A **Reset size** button appears on hover/selection when a manual width is set, allowing the user to revert to natural/fluid width. The click-outside deselect handler uses a stable dep array (`[clearSelection, setSelected]`) so it is not re-registered on every Lexical selection change.

**Attempted: Editable alt text on images (June 2026 — abandoned)** — four separate attempts were made to add an inline alt text `<input>` inside `ImageResizeDecorator`. All failed because the decorator renders _inside_ the Lexical `contenteditable` DOM tree, which means: (1) native keyboard events from the input bubble to Lexical's listeners before React's synthetic handlers fire; (2) focusing the input blurs the contenteditable, which causes Lexical to call `$setSelection(null)` — hiding any UI that depends on `isSelected`; (3) Lexical reconciliation triggered by selection updates can unmount and remount the decorator component, resetting `useState`; (4) async `editor.update()` inside `onBlur` loses the race with form submission; (5) dirty-state detection requires a Lexical node update on every keystroke. These five constraints interact and must all be solved simultaneously — no partial fix was stable. See the detailed lessons-learned block in CLAUDE.md (under "Attempted: alt text input on images"). Deferred for a future session.

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

**Fix:** `handlePick` now prefixes with `window.location.origin`:

```ts
onPick(`${window.location.origin}${variantUrl(image, variant)}`, image.original_name);
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
