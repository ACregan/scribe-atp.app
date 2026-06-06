# Ubiquitous Language: Scribe CMS

## Terminology Glossary

### Core Domain

| Term | Definition | Aliases to Avoid |
| :--- | :--- | :--- |
| **Owner** | A user who holds a Site record on their PDS and has full management privileges over that Site — creating Groups, assigning Articles, and managing Contributors. | Admin, Editor, Author |
| **Contributor** | A user added by an Owner to a Site who can write Articles for that Site. Their Articles appear in the Owner's CMS for assignment to Groups. | Author, Writer, Member |
| **Site** | A managed website whose manifest (Groups, Article references, metadata) is stored as a single record on the Owner's PDS. | Blog, Website, Publication |
| **Group** | A named, ordered collection of Articles within a Site. A Site may have zero or more Groups. Order is significant and controlled by the Owner. | Category, Section, Tag, Folder |
| **Article** | A document (title, HTML content, slug, metadata) stored on the author's PDS. An Article is site-agnostic — it carries no reference to any Site or Group. | Post, Page, Entry |
| **ArticleRef** | A cached snapshot of Article metadata (all fields except content) stored inside a Site record. Allows Sites to be read without fetching each Article individually. | Article link, Article pointer |
| **Slug** | A lowercase, dash-separated string that serves as both the URL path segment and the AT Protocol record key (rkey) for Articles and Groups. | URL, path, ID, handle |
| **Unassigned Article** | An Article that exists on the author's PDS but is not referenced in any Site's Groups or top-level articles list. | Orphan, Draft, Unpublished |

### Image Library

| Term | Definition | Aliases to Avoid |
| :--- | :--- | :--- |
| **Image Library** | The shared, browsable collection of uploaded images available to all users of the CMS. Each user has their own top-level folder within the library. | Media library, Asset library, File manager |
| **Image Service** | A dedicated Node.js service, separate from the main React Router app, responsible for image upload, processing (Variant generation), and storage. | Upload service, Media service, CDN |
| **Variant** | A generated WebP copy of an uploaded image constrained to a specific Bounding Box. Every uploaded image produces a set of Variants. | Size, Copy, Version, Thumbnail (except for the thumb Variant specifically) |
| **Bounding Box** | The maximum dimension constraint applied to a Variant, measured on the longest side. A 600 Bounding Box means the longest side ≤ 600px; aspect ratio is always preserved. | Max dimension, Max size, Constraint |
| **max** | The largest Variant — the uploaded image at its original dimensions, converted to WebP, with a 3000px Bounding Box cap. Named "max" because "original" would falsely imply the source file is unmodified. | original, full, source |
| **thumb** | The smallest Variant; 300px Bounding Box. | thumbnail (except colloquially) |
| **Image Storage** | The URL namespace and filesystem location where Variants are served. Public URL prefix: `/image-storage/{user_did}/{uuid}/{variant}.webp`. Served directly by nginx from the filesystem — the Image Service is not involved in reads. | image CDN, media storage, uploads folder |
| **User Image Folder** | The top-level folder in the Image Library automatically created on a user's first upload. Contains all images and subfolders owned by that user. Browsable by all authenticated users; only the owning user can upload, delete, move, or create subfolders within it. | User folder, personal folder, user directory |
| **Image Tile** | The grid card representing a single uploaded image in the Image Library browser. Displays a thumbnail preview, the filename, and Variant copy buttons (a Thumb button and a size split-button). Double-clicking opens the Image Preview Modal. | Image icon, image card, image item |
| **Folder Tile** | The grid card representing a subfolder in the Image Library browser. Displays a folder icon (with avatar for top-level User Image Folders), the folder name, and a delete action. Clicking navigates into the folder; supports drag-and-drop for moving images or folders. | Folder icon, folder card, folder item |

**Standard Variant set** (generated in ascending order; a Variant is skipped if its Bounding Box exceeds the source image's longest side):

| Name | Bounding Box |
| :--- | :--- |
| thumb | 300px |
| 600 | 600px |
| 1200 | 1200px |
| 1800 | 1800px |
| max | 3000px (cap) |

## Relationships

- A **Site** is owned by exactly one **Owner**; ownership is implicit from whose PDS holds the record.
- A **Site** has zero or more **Contributors**.
- A **Site** has zero or more **Groups**; Group order within a Site is significant.
- A **Group** holds zero or more **ArticleRefs**; Article order within a Group is significant.
- A **Site** also holds a top-level list of **ArticleRefs** (ungrouped Articles).
- An **Article** may be referenced by zero or more Sites simultaneously via **ArticleRef**.
- An **Article** is authored by the user whose PDS holds the record; no explicit author field is needed.
- An uploaded image produces exactly one set of **Variants** (at least thumb and max; intermediate sizes skipped if source is too small to avoid upscaling).
- Every user has exactly one **User Image Folder** at the top level of the **Image Library**; it is created automatically on first upload.
- A **User Image Folder** may contain images and subfolders; subfolders may only be created, deleted, or moved by the owning user.
- Any authenticated user may browse and copy **Variant** URLs from any **User Image Folder**.

## Flagged Ambiguities

- **"original"**: Previously used as the name for the largest stored image size. *Resolved: Use **max**. "original" implies the source file is unmodified; "max" correctly conveys it is a WebP-converted, capped Variant.*
- **"article" vs "post"**: Informal usage often says "post." *Resolved: Use **Article** consistently in code, UI, and documentation.*
- **"user" vs "owner" vs "contributor"**: "User" is ambiguous — it could mean anyone with a CMS account. *Resolved: Use **Owner** when referring to a user in the context of their Site management privileges; use **Contributor** when referring to their role on someone else's Site. "User" is acceptable only in auth/session contexts where no Site role is implied.*
