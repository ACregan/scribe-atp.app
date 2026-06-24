export const ARTICLE_COLLECTION = "app.scribe.article";
export const DOCUMENT_COLLECTION = "site.standard.document";
export const SITE_COLLECTION = "app.scribe.site";

// Domain must contain at least one dot, no spaces, valid hostname chars
export const DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-._]*\.[a-zA-Z]{2,}$/;

// Article URL slug: lowercase letters, numbers, hyphens only
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Image URLs must use https:// — rejects http://, javascript:, data:, relative paths
export const IMAGE_URL_RE = /^https:\/\//i;
