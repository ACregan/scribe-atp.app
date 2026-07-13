export const DOCUMENT_COLLECTION = "site.standard.document";
export const SITE_COLLECTION = "site.standard.publication";

// Base URL for the Scribe Reader — used as the "loose document" `site` value
// per ADR 0013 (docs/adr/0013-document-site-field-is-the-loose-vs-published-signal.md).
// Reader renders any document by rkey regardless of publish state, so this is
// a real, resolvable URL rather than a placeholder.
export const READER_BASE_URL = "https://reader.scribe-atp.app";

// Domain must contain at least one dot, no spaces, valid hostname chars
export const DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-._]*\.[a-zA-Z]{2,}$/;

// Article URL slug: lowercase letters, numbers, hyphens only
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Image URLs must use https:// — rejects http://, javascript:, data:, relative paths
export const IMAGE_URL_RE = /^https:\/\//i;

// "root" is reserved as a group slug — it collides with the hardcoded
// synthetic id ("g:root") that app/routes/article/site-list/siteTree.ts
// uses for the Ungrouped pseudo-node. A real group with this slug would get
// silently merged into ungroupedArticles and lose its title/metadata on the
// next Save Order.
export const RESERVED_GROUP_SLUG = "root";
