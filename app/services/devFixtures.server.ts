// Dev-mode fixture data for all route loaders. Consumed only when useRealOAuth
// is false (local development without a Cloudflare tunnel). Each function is
// typed to match the corresponding loader's return shape so TypeScript will
// catch shape mismatches at call sites when the real loader changes.

import type { SiteCard, SiteOption } from "~/components/types";
import type { SiteManifest } from "~/routes/article/site-list/siteTree";
import type { ArticleRef } from "~/hooks/types";

// ── Shared base data ──────────────────────────────────────────────────────────

const DEV_DID = "did:dev:user";

const DEV_SITE_OPTIONS: SiteOption[] = [
  { rkey: "norobots-blog", title: "NoRobots.blog", url: "norobots.blog" },
  {
    rkey: "perpetualsummer-ltd",
    title: "Perpetual Summer LTD",
    url: "perpetualsummer.ltd",
  },
];

const DEV_UNGROUPED: ArticleRef[] = [
  {
    uri: `at://${DEV_DID}/app.scribe.article/getting-started`,
    title: "Getting Started with AT Protocol",
    slug: "getting-started",
    splashImageUrl: null,
    createdAt: "2025-02-01T00:00:00.000Z",
  },
  {
    uri: `at://${DEV_DID}/app.scribe.article/lexical-editor`,
    title: "Building a Rich Text Editor with Lexical",
    slug: "lexical-editor",
    splashImageUrl: null,
    createdAt: "2025-03-20T00:00:00.000Z",
  },
];

// ── /sites ────────────────────────────────────────────────────────────────────

export function devSitesLoader(): { sites: SiteCard[] } {
  return {
    sites: [
      {
        rkey: "norobots-blog",
        cid: "dev-cid-s1",
        title: "NoRobots.blog",
        url: "norobots.blog",
        urlPrefix: "blog",
        description:
          "A personal blog about technology, the open web, and avoiding robots.",
        splashImageUrl: "",
        logoImageUrl: "",
        groupCount: 2,
        articleCount: 7,
      },
      {
        rkey: "perpetualsummer-ltd",
        cid: "dev-cid-s2",
        title: "Perpetual Summer LTD",
        url: "perpetualsummer.ltd",
        urlPrefix: "articles",
        description: "",
        splashImageUrl: "",
        logoImageUrl: "",
        groupCount: 0,
        articleCount: 3,
      },
    ],
  };
}

// ── /groups ───────────────────────────────────────────────────────────────────

export function devGroupsLoader() {
  return {
    sites: [
      {
        rkey: "norobots-blog",
        title: "NoRobots.blog",
        url: "norobots.blog",
        urlPrefix: "blog",
        groups: [
          { slug: "engineering", title: "Engineering", articleCount: 4 },
          { slug: "getting-started", title: "Getting Started", articleCount: 2 },
        ],
      },
      {
        rkey: "perpetualsummer-ltd",
        title: "Perpetual Summer LTD",
        url: "perpetualsummer.ltd",
        urlPrefix: "",
        groups: [] as { slug: string; title: string; articleCount: number }[],
      },
    ],
  };
}

// ── / (home) ──────────────────────────────────────────────────────────────────

export function devHomeLoader(handle: string | null | undefined) {
  return {
    userName: handle ?? null,
    isDev: true as const,
    recentArticles: [
      {
        uri: `at://${DEV_DID}/app.scribe.article/my-first-post`,
        title: "My First Post",
        slug: "my-first-post",
        createdAt: "2025-06-01T09:00:00.000Z",
        updatedAt: "2025-06-04T10:00:00.000Z",
      },
      {
        uri: `at://${DEV_DID}/app.scribe.article/design-principles`,
        title: "Design Principles",
        slug: "design-principles",
        createdAt: "2025-05-20T08:00:00.000Z",
        updatedAt: "2025-06-01T09:00:00.000Z",
      },
      {
        uri: `at://${DEV_DID}/app.scribe.article/getting-started`,
        title: "Getting Started with AT Protocol",
        slug: "getting-started",
        createdAt: "2025-05-28T14:00:00.000Z",
      },
    ],
    orphanedArticleCount: 2,
    sites: [
      {
        rkey: "norobots-blog",
        title: "NoRobots.blog",
        groups: [
          { slug: "engineering", title: "Engineering", articleCount: 4 },
          { slug: "getting-started", title: "Getting Started", articleCount: 2 },
        ],
      },
      {
        rkey: "perpetualsummer-ltd",
        title: "Perpetual Summer LTD",
        groups: [] as { slug: string; title: string; articleCount: number }[],
      },
    ],
  };
}

// ── /article/list ─────────────────────────────────────────────────────────────

export function devArticleListLoader() {
  return {
    publishedArticles: [
      {
        rkey: "my-first-post",
        uri: `at://${DEV_DID}/site.standard.document/my-first-post`,
        title: "My First Post",
        publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        assignments: [
          {
            siteTitle: "NoRobots.blog",
            siteRkey: "norobots-blog",
            groupTitle: "Getting Started",
          },
        ],
      },
      {
        rkey: "second-post",
        uri: `at://${DEV_DID}/site.standard.document/second-post`,
        title: "Second Post",
        publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        assignments: [
          {
            siteTitle: "NoRobots.blog",
            siteRkey: "norobots-blog",
            groupTitle: undefined,
          },
          {
            siteTitle: "Perpetual Summer LTD",
            siteRkey: "perpetualsummer-ltd",
            groupTitle: undefined,
          },
        ],
      },
    ],
    orphanedDrafts: [
      {
        rkey: "dev-orphan",
        uri: `at://${DEV_DID}/app.scribe.article/dev-orphan`,
        title: "Dev Orphan Draft",
        cid: "dev-cid",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

// ── /article/create ───────────────────────────────────────────────────────────

export function devCreateLoader(
  preselect: string | undefined,
): { sites: SiteOption[]; preselectedSite: string | undefined } {
  const sites = DEV_SITE_OPTIONS;
  return {
    sites,
    preselectedSite: sites.some((s) => s.rkey === preselect)
      ? preselect
      : undefined,
  };
}

// ── /article/edit ─────────────────────────────────────────────────────────────

export function devEditLoader(articleUrl: string): {
  rkey: string;
  title: string;
  content: string;
  slug: string;
  splashImageUrl: string;
  description: string;
  createdAt: string;
  cid: string;
  sites: SiteOption[];
  currentSiteRkeys: string[];
} {
  return {
    rkey: articleUrl,
    title: "Dev mode article",
    content: "Dev mode content",
    slug: articleUrl,
    splashImageUrl: "",
    description: "",
    createdAt: new Date().toISOString(),
    cid: "dev-cid",
    sites: DEV_SITE_OPTIONS,
    currentSiteRkeys: [],
  };
}

// ── /article/list/:siteSlug ───────────────────────────────────────────────────

export function devSiteListLoader(siteSlug: string): {
  devMode: boolean;
  site: SiteManifest;
} {
  return {
    devMode: true,
    site: {
      rkey: siteSlug,
      cid: "dev-cid-site",
      url: "norobots.blog",
      title: "NoRobots.blog (Dev)",
      urlPrefix: "blog",
      groups: [
        {
          slug: "engineering",
          title: "Engineering",
          articles: [
            {
              uri: `at://${DEV_DID}/app.scribe.article/hello-world`,
              title: "Hello World",
              slug: "hello-world",
              splashImageUrl: null,
              createdAt: "2025-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
      ungroupedArticles: DEV_UNGROUPED,
    },
  };
}

// ── /article/view ─────────────────────────────────────────────────────────────

export function devViewLoader(articleUrl: string) {
  return {
    title: "Dev mode article",
    content: "This is placeholder content for dev mode.",
    splashImageUrl: "",
    description: "",
    createdAt: new Date().toISOString(),
    slug: articleUrl,
  };
}

// ── /site/:siteName/configure ─────────────────────────────────────────────────

export function devConfigureLoader(siteSlug: string) {
  return {
    site: {
      rkey: siteSlug,
      title: "NoRobots.blog",
      url: "norobots.blog",
      urlPrefix: "blog",
      description:
        "A personal blog about technology, the open web, and avoiding robots.",
      splashImageUrl: "",
      logoImageUrl: "",
    },
  };
}
