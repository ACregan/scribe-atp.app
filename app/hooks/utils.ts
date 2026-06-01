export interface ArticleRef {
  uri: string;
  title: string;
  url?: string;
  splashImageUrl: string | null;
  synopsis?: string | null;
  createdAt: string;
}

export interface SiteGroup {
  slug: string;
  title: string;
  articles: ArticleRef[];
}

export interface Site {
  title: string;
  url: string;
  urlPrefix: string;
  description?: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groups: SiteGroup[];
  articles: ArticleRef[];
}

export interface Article {
  title: string;
  content: string; // HTML produced by the Scribe rich text editor
  url: string;
  splashImageUrl?: string;
  synopsis?: string;
  createdAt: string;
}

/** Extracts the article slug from an AT Protocol URI. */
export function slugFromUri(uri: string): string {
  return uri.split("/").pop()!;
}

/** Returns all article refs from a site as a flat array (grouped first, then ungrouped). */
export function flattenArticles(site: Site): ArticleRef[] {
  return [...site.groups.flatMap((g) => g.articles), ...site.articles];
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
