import type { ArticleRef, Site } from "./types";

/** Converts a human-readable title into a URL slug (lowercase, hyphens). */
export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Extracts the article slug from an AT Protocol URI. */
export function slugFromUri(uri: string): string {
  return uri.split("/").pop()!;
}

/** Returns all article refs from a site as a flat array (grouped first, then ungrouped). */
export function flattenArticles(site: Site): ArticleRef[] {
  return [...site.groups.flatMap((g) => g.articles), ...site.ungroupedArticles];
}
