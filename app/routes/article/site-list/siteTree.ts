// Pure data-transformation utilities for the site-list DnD tree.
// Extracted here so they can be unit-tested independently of the route component.

// ── Types ─────────────────────────────────────────────────────────────────────

export type SiteArticleRef = {
  uri: string;
  title: string;
  url?: string;
  splashImageUrl: string | null;
  synopsis?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type SiteGroup = {
  slug: string;
  title: string;
  articles: SiteArticleRef[];
};

export type SiteData = {
  rkey: string;
  cid: string;
  url: string;
  title: string;
  urlPrefix: string;
  groups: SiteGroup[];
  articles: SiteArticleRef[];
};

export type TreeArticleNode = {
  kind: "article";
  id: string;
  uri: string;
  title: string;
  url?: string;
  splashImageUrl: string | null;
  synopsis?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type TreeGroupNode = {
  kind: "group";
  id: string;
  slug: string;
  title: string;
  children: TreeArticleNode[];
};

// ── ID helpers ────────────────────────────────────────────────────────────────

export { slugFromUri } from "~/hooks/utils";
import { slugFromUri } from "~/hooks/utils";

export function articleId(slug: string): string {
  return `a:${slug}`;
}

export function groupId(slug: string): string {
  return `g:${slug}`;
}

// ── Slug generator (group title → URL slug) ───────────────────────────────────

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ── Tree builders ─────────────────────────────────────────────────────────────

export function buildTreeFromSite(site: SiteData): TreeGroupNode[] {
  const root: TreeGroupNode = {
    kind: "group",
    id: "g:root",
    slug: "root",
    title: "Ungrouped",
    children: (site.articles ?? []).map((a) => ({
      kind: "article",
      id: articleId(slugFromUri(a.uri)),
      uri: a.uri,
      title: a.title,
      url: a.url,
      splashImageUrl: a.splashImageUrl,
      synopsis: a.synopsis,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  };

  const named: TreeGroupNode[] = (site.groups ?? []).map((g) => ({
    kind: "group",
    id: groupId(g.slug),
    slug: g.slug,
    title: g.title,
    children: (g.articles ?? []).map((a) => ({
      kind: "article",
      id: articleId(slugFromUri(a.uri)),
      uri: a.uri,
      title: a.title,
      url: a.url,
      splashImageUrl: a.splashImageUrl,
      synopsis: a.synopsis,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  }));

  return [root, ...named];
}

export function treeToSiteData(tree: TreeGroupNode[]): {
  groups: SiteGroup[];
  articles: SiteArticleRef[];
} {
  const groups: SiteGroup[] = [];
  const articles: SiteArticleRef[] = [];

  for (const node of tree) {
    if (node.id === "g:root") {
      for (const child of node.children) {
        articles.push({
          uri: child.uri,
          title: child.title,
          url: child.url,
          splashImageUrl: child.splashImageUrl,
          synopsis: child.synopsis,
          createdAt: child.createdAt,
          updatedAt: child.updatedAt,
        });
      }
    } else {
      groups.push({
        slug: node.slug,
        title: node.title,
        articles: node.children.map((c) => ({
          uri: c.uri,
          title: c.title,
          url: c.url,
          splashImageUrl: c.splashImageUrl,
          synopsis: c.synopsis,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      });
    }
  }

  return { groups, articles };
}
