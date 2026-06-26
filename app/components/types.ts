export interface SiteCard {
  rkey: string;
  cid: string;
  title: string;
  url: string;
  urlPrefix: string;
  description?: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groupCount: number;
  articleCount: number;
}

export type SiteOption = { rkey: string; title: string; url: string };

export interface TreeArticle {
  id: string;
  uri: string;
  cid?: string;
  title: string;
  createdAt: string;
  slug?: string;
}
