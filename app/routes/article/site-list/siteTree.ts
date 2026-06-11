// Pure data-transformation utilities for the site-list DnD tree.
// Extracted here so they can be unit-tested independently of the route component.

// ── Types ─────────────────────────────────────────────────────────────────────

export type { ArticleRef, SiteGroup } from "~/hooks/types";
import type { ArticleRef, SiteGroup } from "~/hooks/types";

export type SiteData = {
  rkey: string;
  cid: string;
  url: string;
  title: string;
  urlPrefix: string;
  groups: SiteGroup[];
  ungroupedArticles: ArticleRef[];
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

// ── Site record mutations ─────────────────────────────────────────────────────
//
// These operate on the raw AT Protocol Site record value (not the normalised
// SiteData shape) so that unknown fields are preserved when the record is
// written back to the PDS via putRecord.

export type SiteRecordValue = {
  ungroupedArticles: ArticleRef[];
  groups: Array<
    { slug: string; title: string; articles: ArticleRef[] } & Record<
      string,
      unknown
    >
  >;
} & Record<string, unknown>;

export function removeArticleRef(
  record: SiteRecordValue,
  uri: string,
): SiteRecordValue {
  return {
    ...record,
    ungroupedArticles: (record.ungroupedArticles ?? []).filter(
      (a) => a.uri !== uri,
    ),
    groups: (record.groups ?? []).map((g) => ({
      ...g,
      articles: (g.articles ?? []).filter((a) => a.uri !== uri),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function updateArticleRef(
  record: SiteRecordValue,
  oldUri: string,
  newRef: ArticleRef,
): SiteRecordValue {
  return {
    ...record,
    ungroupedArticles: (record.ungroupedArticles ?? []).map((a) =>
      a.uri === oldUri ? newRef : a,
    ),
    groups: (record.groups ?? []).map((g) => ({
      ...g,
      articles: (g.articles ?? []).map((a) => (a.uri === oldUri ? newRef : a)),
    })),
    updatedAt: new Date().toISOString(),
  };
}

// ── ArticleRef ↔ TreeArticleNode conversions ──────────────────────────────────
//
// Single source of truth for the field mapping between the PDS ArticleRef shape
// and the in-memory tree node shape. Every ArticleRef field mirrored in
// TreeArticleNode must be kept in sync through these two functions only —
// buildTreeFromSite and treeToSiteData delegate all field work to them.

export function nodeFromRef(ref: ArticleRef): TreeArticleNode {
  return {
    kind: "article",
    id: articleId(slugFromUri(ref.uri)),
    uri: ref.uri,
    title: ref.title,
    url: ref.url,
    splashImageUrl: ref.splashImageUrl,
    synopsis: ref.synopsis,
    createdAt: ref.createdAt,
    updatedAt: ref.updatedAt,
  };
}

export function articleRefFromNode(node: TreeArticleNode): ArticleRef {
  return {
    uri: node.uri,
    title: node.title,
    url: node.url,
    splashImageUrl: node.splashImageUrl,
    synopsis: node.synopsis,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

// ── Tree builders ─────────────────────────────────────────────────────────────

export function buildTreeFromSite(site: SiteData): TreeGroupNode[] {
  const root: TreeGroupNode = {
    kind: "group",
    id: "g:root",
    slug: "root",
    title: "Ungrouped",
    children: (site.ungroupedArticles ?? []).map(nodeFromRef),
  };

  const named: TreeGroupNode[] = (site.groups ?? []).map((g) => ({
    kind: "group",
    id: groupId(g.slug),
    slug: g.slug,
    title: g.title,
    children: (g.articles ?? []).map(nodeFromRef),
  }));

  return [root, ...named];
}

export function treeToSiteData(tree: TreeGroupNode[]): {
  groups: SiteGroup[];
  ungroupedArticles: ArticleRef[];
} {
  const groups: SiteGroup[] = [];
  const ungroupedArticles: ArticleRef[] = [];

  for (const node of tree) {
    if (node.id === "g:root") {
      ungroupedArticles.push(...node.children.map(articleRefFromNode));
    } else {
      groups.push({
        slug: node.slug,
        title: node.title,
        articles: node.children.map(articleRefFromNode),
      });
    }
  }

  return { groups, ungroupedArticles };
}
