# Changelog

All notable changes to Scribe ATP are documented here, organised by version. Versions follow semver. Semver tracking started at 5.0.0 — everything before that is grouped under **Foundation**.

---

## [Unreleased]

_Nothing unreleased — `main` is current._

---

## [5.11.6] — 2026-07-05

### Fixed

- **`/site/:siteSlug/configure` save** — the site-record write had no `swapRecord`/CID check at all (unlike every other site-record write in the codebase), a real concurrent-edit race window; now passes the CID fetched immediately before the save.
- **`/site/:siteSlug/configure` canonical-URL cascade** — the document scan triggered by a domain/basePath change used `limit: 100` with no cursor, silently missing documents beyond the first page on larger sites; now paginated via `listDocuments`.

### Changed (internal)

- **Fourth route migrated onto the repository seam** — `app/routes/site/configure/configure.tsx`'s loader/action no longer hand-roll `agent.com.atproto.repo.*` calls; uses `getSite`/`putSite` (`siteRepository.server.ts`) and `listDocuments`/`putDocument` (`documentRepository.server.ts`, now also covering put). The route's local `resolveLogoThumbUrl` helper (byte-for-byte duplicate) was replaced with the existing shared `resolveThumbUrl` from `article.server.ts`. Added test coverage for `configure.tsx` (previously untested).

---

## [5.11.5] — 2026-07-05

### Fixed

- **`/article/list` delete** — deleting an article's PDS record never removed its `ArticleRef` from any site's `ungroupedArticles`/`groups`, leaving orphaned refs pointing at a deleted record; now cleans those up on every site that references the deleted article.
- **`/article/list`** — the loader and delete action had no error handling at all; a PDS failure crashed instead of degrading gracefully (loader now redirects to `/`, action now returns `{ ok: false, error }`).

### Changed (internal)

- **Third route migrated onto the repository seam** — `app/routes/article/list/list.tsx`'s loader/action no longer hand-roll `agent.com.atproto.repo.*` calls; uses `listDocuments`/`deleteDocument` (`documentRepository.server.ts`, now also covering list/delete) and `listSites` (`siteRepository.server.ts`). Both document and site listing are now paginated internally (previously `limit: 100` with no cursor on either). Added test coverage for `list.tsx` (previously untested).

---

## [5.11.4] — 2026-07-05

### Changed (internal)

- **Document repository seam introduced** — `app/routes/article/create/create.tsx`'s article-creation call no longer hand-rolls `agent.com.atproto.repo.createRecord` directly; extracted to new `app/services/documentRepository.server.ts` (`createDocument`), second of five routes migrating onto a shared repository seam per the architecture review (candidate #2). Added test coverage for `create.tsx` (previously untested) and the new module. `documentRepository.server.ts` will grow `getDocument`/`putDocument`/`deleteDocument`/`listDocuments` as `list.tsx`, `configure.tsx`, and `edit.tsx` migrate onto it in follow-up PRs.

---

## [5.11.3] — 2026-07-05

### Changed (internal)

- **Site repository seam introduced** — `app/routes/sites/sites.tsx`'s loader/action no longer hand-roll `agent.com.atproto.repo.*` calls directly; extracted to new `app/services/siteRepository.server.ts` (`listSites`, `getSite`, `createSite`, `putSite`, `deleteSite`), the first of five routes migrating onto a shared repository seam per the architecture review (candidate #2, follow-up to the site-list extraction in 5.11.2). Added test coverage for `sites.tsx` (previously untested) and the new module.

---

## [5.11.2] — 2026-07-05

### Fixed

- **`createGroup`** — a PDS failure (e.g. a concurrent-edit CID mismatch) previously threw past the site-list action instead of returning an error, unlike every sibling intent; now caught and reported the same way
- **`moveToDraft`** — running it on an article already in a site's unpublished list could append a duplicate `ArticleRef`; now filters out any existing match before appending
- **`publishArticle`** — malformed `siteAssignments` form data crashed the whole action instead of degrading gracefully; now guarded and returns `{ ok: false }`
- **`publishArticle`** — failures returned no error message, so the frontend's failure toast could never fire; now includes an error message

### Changed (internal)

- **Site manifest logic extracted** — the site-list route's action (`createGroup`, `deleteGroup`, `saveSite`, `removeArticle`, `publishArticle`, `moveToDraft`) moved out of the ~610-line inline action into `app/services/siteManifest.server.ts`, mirroring the existing `article.server.ts`/`articleSiteSync.server.ts` pattern; the route is now a thin dispatcher. Added test coverage for all six intents (previously untested) at both the action-dispatch and module level.

---

## [5.9.0] — 2026-06-19

### Added

- **Publish/draft workflow** — articles on `/article/list/:siteSlug` now have explicit Publish and Move to Drafts actions alongside drag-and-drop reordering; the "Ungrouped Articles" root section is renamed "Unpublished Articles" to clarify draft status; Publish opens a group-picker modal so the author can choose where to place the article; Move to Drafts shows a confirmation modal naming the source site and group; backed by new `publishArticle` and `moveToDraft` server actions on the site-list route
- **Success (`"success"`) variant** — new green variant added to `Button`, `Pill`, `Toast`, and `TooltipBubble`; backed by `--action-success` and `--toast-success-background-colour` semantic tokens (both map to the existing `--salem` palette colour); all save/submit/confirm buttons and positive-completion toasts updated to use the new variant (`"Article saved"`, `"Site configured"`, `"Group created"`, `"Order saved"`, etc.)
- **Toast slide transitions** — toasts now slide in from the right on mount and slide out on dismiss; `ToastContainer` adds `overflow: hidden` to prevent scrollbar jank during transitions
- **`TextArrayInput` component** (`app/components/TextArrayInput/`) — reusable controlled input for managing a list of string values; add/remove entries via keyboard or button; salvaged and integrated into the design system

---

## [5.8.0] — 2026-06-16

### Added

- **Umami analytics** — privacy-friendly page-view tracking via self-hosted Umami instance (`analytics.perpetualsummer.ltd`); script injected only in production (suppressed in dev and E2E via a runtime loader flag); `script-src` and `connect-src` CSP directives updated to allow the analytics domain

### Fixed

- **Per-request CSP nonce** — replaced static SHA-256 hash with a cryptographic nonce generated per request; React 18 SSR streaming (`renderToPipeableStream`) injects dynamic inline `<script>` tags for Suspense boundary resolution whose content cannot be predicted, making a static hash unworkable; nonce is generated in the root loader and threaded through `entry.server.tsx`, `ServerRouter`, `<Scripts>`, and `<ScrollRestoration>`

### Infrastructure

- **CI runner migration** — typecheck, unit, and E2E jobs migrated from Imhotep (ARM64 Raspberry Pi, shell executor) to `SERVER-docker-runner` (Windows/Docker Desktop, Docker executor); CI time approximately halved from ~22 minutes to ~10 minutes; Imhotep retained for the deploy job only
- **Domain migration** — canonical domain changed from `scribe-atp.app` to `scribe-cms.app`; nginx redirect from old domain added; PM2 `PUBLIC_URL` updated; OAuth `client_id` and `redirect_uri` now point to new domain; ADR added documenting the switch
- **Rebrand** — package name, pino logger name, README, CI environment URL, and `CLAUDE.md` updated from `scribe-atp` to `scribe-cms` where safe to change (collection names and file paths unchanged)

---

## [5.7.2] — 2026-06-15

### Security

- **HTTP security headers** (`entry.server.tsx`) — `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security` (production only) applied to every response via a new `applySecurityHeaders()` function
- **Content Security Policy** — `Content-Security-Policy` header added; inline theme-detection script whitelisted by SHA-256 hash (`'sha256-LY0WmDNgT2tT94lZyQ2tYxwi9P0ohZ5I8xEYNyKfi7Q='`); `style-src 'unsafe-inline'` retained for Lexical editor inline formatting
- **Image URL protocol validation** — `splashImageUrl` and `logoImageUrl` inputs on article create/edit and site configure now reject anything that does not start with `https://`; shared constant `IMAGE_URL_RE` added to `app/constants.ts`
- **HTML sanitisation** — article content rendered via `dangerouslySetInnerHTML` on `/article/view` is now passed through `isomorphic-dompurify` (server-side) before reaching the component
- **E2E bypass guard** — `auth.server.ts` now throws at startup if `NODE_ENV=production`, `E2E=true`, and `CI` is not set; prevents the login bypass from accidentally reaching a live server
- **Login rate limiting** — `/login` action is now limited to 10 attempts per IP per 15-minute rolling window; attempts tracked in a new `login_attempts` SQLite table; stale rows pruned on startup; `X-Forwarded-For` used for client IP; blocked requests return an error message
- **Self-hosted Inter font** — Google Fonts dependency removed; Inter woff2 files already present in `public/fonts/Inter/` are now served via a local stylesheet; eliminates Google tracking on page load, removes external `font-src` and `style-src` CSP entries, and removes the supply-chain dependency
- **Structured audit logging** — `pino` added for structured JSON logging to stdout (captured by PM2); security-relevant events logged: `auth.login_attempt`, `article.create`, `article.update`, `article.delete`, `site.create`, `site.delete`, `site.configure`, `article.nuke` (warn), `image.upload`, `image.delete`; shared logger in `shared/logger.ts`; app routes re-export via `app/services/logger.server.ts`; image service imports directly from `shared/logger.js`
- **Unused Dockerfile removed** — stale file used a root-default base image and was not referenced in any pipeline

### Fixed (internal)

- `db.server.ts` migration now runs on every module load (outside the `global.__db` singleton guard) — `IF NOT EXISTS` makes all migrations idempotent; fixes `no such table` errors on Vite HMR reloads when new tables are added

### Infrastructure (VPS — no code change)

- nginx `access_log off` removed from `location /` — HTTP access logs re-enabled for the main app
- Image storage path migrated from `/root/server/SITES/scribe-atp.app/image-storage/` to `/var/scribe/images/` (101/101 images verified); nginx alias and PM2 `IMAGE_STORAGE_ROOT` env updated
- `docs/nginx/image-library.conf` updated to reflect new image storage path

**Full audit report:** `docs/archive/security/1.security-review-15-06-26.md`

---

## [5.7.1] — 2026-06-15

### Changed (internal)

- `article.server.ts` deepened with `createArticle` and `updateArticle` — article create and edit route actions collapsed to thin orchestrators; business logic (slug validation, record building, site ref propagation) now unit-tested behind a named interface
- `articleSiteSync.server.ts` gained `findSitesContaining` — edit loader no longer accesses site records directly; 6 new unit tests cover the seam
- Image Library route (`images.tsx`) decomposed into `useImageLibrary.ts` hook and `ImageGrid.tsx` pure component; route file reduced from ~1,050 to ~270 lines
- `imageServiceClient.server.ts` added — server-side Image Service client (direct `http://localhost:3009`) distinct from the browser-only proxy client
- `ToolbarPlugin` renamed to `EditorToolbar` (file and component); `chromVisible` removed from the toolbar interface — fullscreen CSS class application moved to a wrapper div in `RichTextEditor.tsx` where all fullscreen state already lives

---

## [5.7.0] — 2026-06-14

### Added

- Fullscreen distraction-free mode for the Lexical editor — enter/exit via toolbar button; chrome (toolbar + stats bar) hides after 2 s of mouse inactivity and reappears on movement
- Toolbar and stats bar can be individually pinned in fullscreen mode so they stay visible regardless of activity; pinned state resets on exit
- Pin and Pinned SVG icons added to `SvgIcon`

### Fixed

- Dark mode: editor text was rendered in dark grey on a dark background — added missing `[data-theme="dark"]` override for `--text-editor` token
- Dark mode: all hardcoded `var(--white)` references in `RichTextEditor.module.css` replaced with semantic tokens (`--surface-input`, `--surface-page`) so the editor, toolbar inputs, and checkbox pseudo-elements adapt correctly
- Pinned toolbar/stats bar spacing used `padding-top`/`padding-bottom` on the scrollable `editorInner` container, creating phantom scrollable space; changed to `margin-top`/`margin-bottom` on the flex child so the scrollbar only reflects real content height

---

## [5.6.0] — 2026-06-09

### Added

- Editable alt text on embedded images: an **Alt text** button appears on image hover/select and opens a native `<dialog>` modal with a pre-filled textarea; saving commits the change synchronously via `editor.update(fn, { discrete: true })`
- Module-level `Set<NodeKey> openModals` persists modal open state across decorator remounts
- ADR 0007 documenting why a modal was chosen over an inline input for alt text editing
- Favicons updated

### Fixed

- Form component label colours standardised
- Home page settings panel padding adjusted
- `ImagePickerModal` tests updated to expect absolute image URLs
- Documentation: dirty-state detection, image URL absolutization, `commitPendingRef` pattern

---

## [5.5.1] — 2026-05-29

### Added

- Version number displayed in a tooltip on logo hover in the header

### Fixed

- Stats bar showed 0 word/char counts on initial load of an existing article; switched to `registerUpdateListener` directly (bypassing `OnChangePlugin`'s `prevEditorState.isEmpty()` guard)
- Editor was falsely marked dirty on the edit page immediately after load
- Reset size button did not trigger dirty state when navigating back to the editor after a previous session
- Second image resize attempt was blocked by the catch-up `useEffect` (`commitPendingRef` fix)
- Visual flash when committing image resize on mouseup (race between local drag state and Lexical node update)
- Image src URL was not absolutized when inserting from the Image Library picker; absolute URLs are required because article HTML is consumed by external sites

---

## [5.5.0] — 2026-05-20

### Added

- **Stats bar** in the Lexical editor: word count and character count, displayed in a bar below the content area; uses `registerUpdateListener` directly with a dirty-elements guard
- **Reset size** button on the image resize decorator: appears on hover/select when an image has a stored width; calls `node.setWidth(null)` to remove the constraint
- Image toolbar button: replaced emoji with an SVG icon (`SvgImageList.Image`)

### Fixed

- Relative image `src` values (e.g. `/image-storage/…`) were being dropped when loading existing article content into the editor

---

## [5.4.0] — 2026-05-10

### Added

- **ImagePickerModal**: browse the Image Library and insert images at cursor position; per-Variant insert buttons (Thumb, 600, 1200, 1800, Max); image URLs are absolutized with `window.location.origin`
- Image toolbar button (replaces the previous inline URL input) opens `ImagePickerModal`
- Shared image browser types (`BrowseFolder`, `BrowseImage`, `BrowseResponse`, `VARIANT_ORDER`, `VARIANT_LABEL`, `variantUrl`, `thumbUrl`) in `imageBrowserTypes.ts`; consumed by both the modal and the `/images` route
- **`imageNode` width field**: `__width: number | null` with full serialisation round-trip (`exportDOM` emits `style="width: Npx; max-width: 100%;"`, `importDOM` reads inline style then `width` attribute, `exportJSON`/`importJSON` include `width`)
- **Image resize decorator** (`ImageResizeDecorator.tsx`): left and right drag handles visible on hover or Lexical node selection; drag state is local React state; single `editor.update()` commits on mouseup; minimum width 80 px; pixel-width badge shown during active drag
- Unit and E2E tests for ImagePickerModal and toolbar integration

---

## [5.3.0] — 2026-04-28

### Added

- **Keyboard shortcuts** for all block types, inline formatting, and navigation actions in the Lexical editor (e.g. `Ctrl+Shift+1–6` for headings, `Ctrl+Shift+7–9` for lists/quote, `Ctrl+K` for link)
- Shortcut hints in toolbar button `title` attributes and dropdown item right-side labels
- `?` button in toolbar opens a modal with a full keyboard shortcut reference table
- `KEY_DOWN_COMMAND` handler uses `event.code` for layout-independent digit matching
- Stay on edit page after a successful save (no redirect)
- **Save button states**: `No Changes` (disabled) when clean; `Save Changes` (enabled) when dirty — `isDirty` tracks any form or editor change and resets after save
- `cidValue` state updated from `actionData.newCid` after each save to prevent stale `swapRecord` on subsequent saves

---

## [5.2.0] — 2026-04-15

### Added

- CI pipeline: typecheck stage, coverage reports, JUnit XML test reports, interruptible jobs
- CI: unit and E2E stages skip when only non-build files change; skip on direct pushes to main

### Fixed

- Lexical inline text styles (colour, background, font family, font size) were silently dropped on reload; `ExtendedTextNode` with a priority-1 span converter preserves them via `setStyle()`
- Inline code semantic tokens (`--inline-code-text-color`, `--inline-code-border-color`, `--inline-code-background-color`) added to token system
- Editor was not marked dirty when content changed on create or edit pages; fixed via `handleContentChange` wired to `HiddenFieldPlugin`'s `onChange`
- Selection-only Lexical updates (cursor moves) were triggering dirty state; `HiddenFieldPlugin` HTML equality check gates all updates
- Drag overlay appearance did not match resting article item
- Deprecated `unstable_BlockerFunction` replaced with `BlockerFunction`
- Edit button added to Home / Recently Updated items

---

## [5.1.0] — 2026-04-05

### Added

- **Welcome page** (`/`): public landing page for unauthenticated visitors with brand imagery, PerpetualSummer link, and sign-in CTA; authenticated users see the dashboard instead
- Image URL import button in the toolbar (inline, pre-modal approach)

### Fixed

- Duplicate login button hidden from header when already on `/`

---

## [5.0.1] — 2026-03-28

### Fixed

- CI deploy: SSH key variable type changed to File to preserve newlines; fixed `libcrypto` error on `ssh-add`
- CI: unit and E2E stages restored after debugging

---

## [5.0.0] — 2026-03-25

_Semver tracking begins here. All prior work described in **Foundation** below._

### Added

- Version number shown in a tooltip on logo hover (groundwork for version indicator)
- Manual deploy stage in GitLab CI: triggers VPS deployment via SSH

---

## Foundation (pre-5.0.0)

Everything built before semver tracking started. Grouped thematically.

### Core app and auth

- React Router v7 (framework mode, SSR) with Vite
- Bluesky OAuth PKCE flow (`@atproto/oauth-client-node`) — PAR, consent screen, callback, session cookie
- Dev bypass mode: skips OAuth in development, sets session directly from submitted handle
- Session cookie (`__session`) signed with `SESSION_SECRET`; SQLite stores OAuth tokens and PKCE state
- `requireAtpAgent` helper — one call for auth + agent in route loaders/actions
- `/logout` route destroys session cookie and SQLite row; forces fresh consent on next login

### AT Protocol data model

- `app.scribe.article` collection — article content with `rkey = url slug`
- `app.scribe.site` collection — site manifest with groups, ungroupedArticles, and cached ArticleRefs
- rkey-as-slug: edit route param maps directly to PDS record key; no secondary lookup
- Slug rename: create at new rkey, delete old (best-effort)
- OAuth scope list as single source of truth in `auth.server.ts`
- Public hooks (`useSite`, `useArticle`) for consumer sites — read-only, no auth required

### Article management

- `/article/create` — write new article to PDS; multi-select assigns to sites; `?site=<rkey>` pre-checks a site
- `/article/edit` — edit existing article; manages site assignment add/remove/slug-rename; ArticleRef keep-alive updates all member sites on every save
- `/article/view` — read-only display
- `/article/list` — site picker + unassigned articles (orphan detection); delete action for orphans
- `/article/list/:siteSlug` — site-scoped article and group management with DnD reordering

### Site management

- `/sites` and `/sites/new` — list, create, delete `app.scribe.site` records; tile/list view toggle
- `/site/:siteName/configure` — edit site metadata (title, description, images, URL, urlPrefix)
- `/groups` and `/groups/new` — all sites with groups; splash/logo imagery, folder icons, article count badges
- Modal-backed `/new` routes: auto-open Add New modal on mount; navigate back to base route on close
- DnD site-list: `useDirtyTree` hook owns tree/savedTree state and dirty tracking; `useSiteListDnD` owns DnD sensors and drag handlers
- Navigation blocker: unsaved changes modal with Stay / Discard / Save & Leave options

### Lexical WYSIWYG editor

- Full toolbar: history, block type, font family/size, bold/italic/underline, code, link, image, colour, format dropdown, align dropdown, speech-to-text
- `ExtendedTextNode` for inline style round-trip (colour, background, font family/size)
- `ImageNode` (`DecoratorNode`) with `INSERT_IMAGE_COMMAND`
- `HiddenFieldPlugin` — syncs editor state to a hidden `<textarea>` on every meaningful change
- `StatsPlugin` — word and character counts
- Check list, code highlighting, link plugin
- SSR-safe: falls back to plain textarea during server render

### Image Library

- Separate Express service on port 3009 — Sharp WebP variant generation (thumb/600/1200/1800/max), sequential processing queue
- `SESSION_SECRET` shared authentication between main app and Image Service
- SSE progress stream per upload UUID — `queued` → `variant:N` per variant → `complete`
- `/images` route — browse folders, upload, organise, copy variant URLs
- `ImagePickerModal` — browse and insert images into the editor
- FullscreenImageViewer — fit/actual mode, info pane, prev/next navigation, auto-hiding chevron
- Bulk select, bulk move, bulk delete
- Folder management — create, delete, move
- User Image Folders auto-created on first upload
- Shared library: any authenticated user can browse all images

### UI / design system

- CSS token system: `colours.css` (palette) + `tokens.css` (semantic) — all components reference semantic tokens only
- Dark mode: theme cookie (unsigned), SSR flash prevention (inline `<script>` + `ThemeProvider`), `DarkModeSwitch` toggle in header
- Light/dark overrides for all surfaces, text, borders, and component-specific tokens
- Components: `Button`, `Input`, `Select` (single + multi), `Modal` (native `<dialog>`), `Spinner`, `Toast`/`ToastContext`, `Tooltip`, `PageContainer`/`PageSection`/`PageSectionColumns`/`PageSectionColumn`, `FooterPortal`, `ArticleForm`, `ArticleList`/`ArticleItem`, `GroupList`/`GroupItem`, `SiteTile`, `SiteListItem`, `IconBadge`, `Pill`, `AsideMenu`, `SvgIcon`
- Collapsible aside: icon-only (6 rem) or expanded (20 rem) with label fade; state persisted in `localStorage`
- `PageContainerHeading` with circular icon badge on all route headings
- `FooterPortal`: portals submit/nav buttons into `<footer>` to keep them out of form DOM

### Infrastructure and testing

- WCAG 2.1 AA accessibility: native `<dialog>`, `<button>` for `DarkModeSwitch`, `tabIndex={-1}` on nested `<Button>` inside `<Link>`, `id`/`htmlFor` label associations, skip-to-content link, collapsible aside
- Vitest + React Testing Library: unit tests for all components and pure functions
- Playwright E2E suite (Chromium): 46 tests across 11 spec files; `E2E=true` escape hatch forces dev-bypass in production build for CI
- GitLab CI pipeline: unit → E2E → manual deploy; `main` branch protected, all changes via MR; auto-cancel redundant MR pipelines
- `/client-metadata.json` generated dynamically from `PUBLIC_URL` at request time
- Nuke dev tool on home page clears all PDS collections for reset in dev/testing
