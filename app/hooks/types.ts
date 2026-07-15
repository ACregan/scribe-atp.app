export interface ArticleRef {
  uri: string;
  title: string;
  slug?: string;
  splashImageUrl: string | null;
  description?: string | null;
  tags?: string[];
  contributors?: { did: string; role?: string; displayName?: string }[];
  createdAt: string;
  publishedAt?: string;
  updatedAt?: string;
  bskyPostRef?: { uri: string; cid: string } | null;
}

export interface SiteGroup {
  slug: string;
  title: string;
  articles: ArticleRef[];
}

// Roster entry on site.standard.publication's scribe.contributors array
// (ADR 0014/0018/0019). Distinct from ArticleRef.contributors above, which is
// an unrelated per-article byline credit (did/role/displayName, no lifecycle
// status) — do not conflate the two.
export interface SiteContributor {
  did: string;
  addedAt: string;
  status: "invited" | "accepted" | "rejected";
}

export interface Site {
  title: string;
  url: string;
  urlPrefix: string;
  description?: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groups: SiteGroup[];
  ungroupedArticles: ArticleRef[];
  contributors: SiteContributor[];
}

export interface Article {
  title: string;
  content: string;
  slug: string;
  splashImageUrl?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}
