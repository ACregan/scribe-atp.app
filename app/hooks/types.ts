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
  content: string;
  url: string;
  splashImageUrl?: string;
  synopsis?: string;
  createdAt: string;
}
