# Changelog

All notable changes to Scribe ATP are documented here, organised by version. Versions follow semver. Semver tracking started at 5.0.0 — everything before that is grouped under **Foundation**.

---

## [Unreleased]

_Nothing unreleased — `main` is current._

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
