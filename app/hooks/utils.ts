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

// ─── internal ────────────────────────────────────────────────────────────────

export const PUBLIC_API = "https://public.api.bsky.app";

export async function resolveIdentifier(handleOrDid: string): Promise<string> {
  if (handleOrDid.startsWith("did:")) return handleOrDid;
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`,
  );
  if (!res.ok) {
    throw new Error(
      `Could not resolve handle "${handleOrDid}": ${res.statusText}`,
    );
  }
  const data = await res.json();
  return data.did as string;
}
