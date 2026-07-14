# Ubiquitous Language: Scribe CMS

## Terminology Glossary

### Core Domain

| Term                   | Definition                                                                                                                                                         | Aliases to Avoid               |
| :--------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------- |
| **Owner**              | A user who holds a Site record on their PDS and has full management privileges over that Site — creating Groups, assigning Articles, and managing Contributors.    | Admin, Editor, Author          |
| **Contributor**        | A user added by an Owner to a Site who can write Articles for that Site. Their Articles appear in the Owner's CMS for assignment to Groups.                        | Author, Writer, Member         |
| **Site**               | A managed website whose manifest (Groups, Article references, metadata) is stored as a single record on the Owner's PDS.                                           | Blog, Website, Publication     |
| **Group**              | A named, ordered collection of Articles within a Site. A Site may have zero or more Groups. Order is significant and controlled by the Owner.                      | Category, Section, Tag, Folder |
| **Article**            | A document (title, HTML content, slug, metadata) stored on the author's PDS. An Article belongs to at most one Site, ever (ADR 0013) — never zero-or-many.         | Post, Page, Entry              |
| **ArticleRef**         | A cached snapshot of Article metadata (all fields except content) stored inside a Site record. Allows Sites to be read without fetching each Article individually. | Article link, Article pointer  |
| **Slug**               | A lowercase, dash-separated string that serves as both the URL path segment and the AT Protocol record key (rkey) for Articles and Groups.                         | URL, path, ID, handle          |
| **Loose Article**      | An Article not yet assigned to any Site — its own `site` field holds a resolvable reader URL rather than a Site's `at://` URI (ADR 0013). The **Loose** publication state. Every Article starts here on creation; assignment and publication happen together via **Publish**. | Draft, Ungrouped Article, Orphan |
| **Publish**            | The single, atomic action that assigns a Loose Article to a Site and places it into a Group in the same step. There is no intermediate "assigned but not grouped" state. | Assign, Add to site            |
| **Unpublish**          | The single, atomic action that removes an Article's Group placement and Site assignment together, returning it to Loose. Merges what used to be two separate actions ("Move to Drafts" + "Remove from Site"). | Move to Drafts, Unassign       |

### Image Library

| Term                      | Definition                                                                                                                                                                                                                                                                                                                                                                   | Aliases to Avoid                                                           |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Image Library**         | The shared, browsable collection of uploaded images available to all users of the CMS. Each user has their own top-level folder within the library.                                                                                                                                                                                                                          | Media library, Asset library, File manager                                 |
| **Image Service**         | A dedicated Node.js service, separate from the main React Router app, responsible for image upload, processing (Variant generation), and storage.                                                                                                                                                                                                                            | Upload service, Media service, CDN                                         |
| **Variant**               | A generated WebP copy of an uploaded image constrained to a specific Bounding Box. Every uploaded image produces a set of Variants.                                                                                                                                                                                                                                          | Size, Copy, Version, Thumbnail (except for the thumb Variant specifically) |
| **Bounding Box**          | The maximum dimension constraint applied to a Variant, measured on the longest side. A 600 Bounding Box means the longest side ≤ 600px; aspect ratio is always preserved.                                                                                                                                                                                                    | Max dimension, Max size, Constraint                                        |
| **max**                   | The largest Variant — the uploaded image at its original dimensions, converted to WebP, with a 3000px Bounding Box cap. Named "max" because "original" would falsely imply the source file is unmodified.                                                                                                                                                                    | original, full, source                                                     |
| **thumb**                 | The smallest Variant; 300px Bounding Box.                                                                                                                                                                                                                                                                                                                                    | thumbnail (except colloquially)                                            |
| **Image Storage**         | The URL namespace and filesystem location where Variants are served. Public URL prefix: `/image-storage/{user_did}/{uuid}/{variant}.webp`. Served directly by nginx from the filesystem — the Image Service is not involved in reads.                                                                                                                                        | image CDN, media storage, uploads folder                                   |
| **User Image Folder**     | The top-level folder in the Image Library automatically created on a user's first upload. Contains all images and subfolders owned by that user. Browsable by all authenticated users; only the owning user can upload, delete, move, or create subfolders within it.                                                                                                        | User folder, personal folder, user directory                               |
| **Image Tile**            | The grid card representing a single uploaded image in the Image Library browser. Displays a thumbnail preview, the filename, and Variant copy buttons (a Thumb button and a size split-button). Double-clicking opens the Image Preview Modal.                                                                                                                               | Image icon, image card, image item                                         |
| **Folder Tile**           | The grid card representing a subfolder in the Image Library browser. Displays a folder icon (with avatar for top-level User Image Folders), the folder name, and a delete action. Clicking navigates into the folder; supports drag-and-drop for moving images or folders.                                                                                                   | Folder icon, folder card, folder item                                      |
| **FullscreenImageViewer** | A browser-native fullscreen experience (Fullscreen API) entered from the Image Preview Modal. Displays the max Variant against a black background with fit-to-screen and 1:1 pixel toggle modes. Contains a collapsible info pane at the bottom (filename, metadata, prev/next/close). State is isolated from the Image Preview Modal — exiting returns the modal unchanged. | Fullscreen preview, fullscreen modal, fullscreen overlay                   |

**Standard Variant set** (generated in ascending order; a Variant is skipped if its Bounding Box exceeds the source image's longest side):

| Name  | Bounding Box |
| :---- | :----------- |
| thumb | 300px        |
| 600   | 600px        |
| 1200  | 1200px       |
| 1800  | 1800px       |
| max   | 3000px (cap) |

## Relationships

- A **Site** is owned by exactly one **Owner**; ownership is implicit from whose PDS holds the record.
- A **Site** has zero or more **Contributors**.
- A **Site** has zero or more **Groups**; Group order within a Site is significant.
- A **Group** holds zero or more **ArticleRefs**; Article order within a Group is significant.
- A **Site** record still has an `ungroupedArticles` field for backwards compatibility, but it is vestigial (ADR 0013) — no current UI path can populate it, since Publish places an Article directly into a Group.
- An **Article** may be referenced by **at most one** Site at a time via **ArticleRef** (ADR 0013) — never zero-or-many. Older data predating this rule has been repaired.
- An **Article** is authored by the user whose PDS holds the record; no explicit author field is needed.
- An uploaded image produces exactly one set of **Variants** (at least thumb and max; intermediate sizes skipped if source is too small to avoid upscaling).
- Every user has exactly one **User Image Folder** at the top level of the **Image Library**; it is created automatically on first upload.
- A **User Image Folder** may contain images and subfolders; subfolders may only be created, deleted, or moved by the owning user.
- Any authenticated user may browse and copy **Variant** URLs from any **User Image Folder**.

## Publication States

**Revised by ADR 0013 (2026-07-08).** An Article now moves through exactly **two** publication states — not three. The previous three-state model (Draft → Unpublished → Published, with a separate "assigned to a Site but not yet in a Group" middle state) was itself the root cause of a real production bug: a document's own `site` field was being stamped with a real Site URI at the Draft→Unpublished transition, before the Article was actually published, leaking unpublished content to third-party `site.standard` readers that only look at `site`. ADR 0013 collapsed assignment and publication into one atomic step, eliminating the middle state entirely.

| State | Condition | Term |
| :---- | :-------- | :--- |
| **Loose** | Not referenced in any Site record; the Article's own `site` field holds a reader URL, not a Site URI | Loose Article |
| **Published** | Referenced in a Group within a Site record; `site` holds that Site's `at://` URI; has a canonical URL | — |

The old **Unpublished**/**Ungrouped Article** state (referenced in a Site's `ungroupedArticles` but not in any Group) no longer has any UI path that can produce it. `ungroupedArticles` remains in the schema for backwards compatibility but is vestigial going forward — treat any non-empty `ungroupedArticles` array as a data artifact predating ADR 0013, not a state new code should create or expect.

### Analytics

| Term                    | Definition                                                                                                                                                                                                                             | Aliases to Avoid                    |
| :---------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| **Umami Configuration** | The optional per-Site connection details (base URL, website ID, API key) linking a Site to an author's own Umami instance. Stored locally in the CMS server's database, never on the Site's AT Protocol record — see ADR 0010. | Umami settings, analytics config     |
| **Umami Website**       | The tracked-site entity within a third-party Umami instance, identified by its **Website ID**. Distinct from a Scribe **Site** — a Scribe Site optionally links to one Umami Website.                                                    | Umami site (ambiguous with **Site**) |

**Note:** Umami Configuration is deliberately excluded from the `scribe` extension object that holds all other Site metadata — see ADR 0010 for why.

## Flagged Ambiguities

- **"original"**: Previously used as the name for the largest stored image size. _Resolved: Use **max**. "original" implies the source file is unmodified; "max" correctly conveys it is a WebP-converted, capped Variant._
- **"article" vs "post"**: Informal usage often says "post." _Resolved: Use **Article** consistently in code, UI, and documentation._
- **"user" vs "owner" vs "contributor"**: "User" is ambiguous — it could mean anyone with a CMS account. _Resolved: Use **Owner** when referring to a user in the context of their Site management privileges; use **Contributor** when referring to their role on someone else's Site. "User" is acceptable only in auth/session contexts where no Site role is implied._
