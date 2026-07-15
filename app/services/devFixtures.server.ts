// Dev-mode fixture data for all route loaders. Consumed only when useRealOAuth
// is false (local development without a Cloudflare tunnel). Each function is
// typed to match the corresponding loader's return shape so TypeScript will
// catch shape mismatches at call sites when the real loader changes.

import type { SiteCard } from "~/components/types";
import type { SiteManifest, RosterEntry } from "~/routes/article/site-list/siteTree";

// ── Shared base data ──────────────────────────────────────────────────────────

const DEV_DID = "did:dev:user";

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
        uri: `at://${DEV_DID}/site.standard.document/my-first-post`,
        title: "My First Post",
        slug: "my-first-post",
        createdAt: "2025-06-01T09:00:00.000Z",
        updatedAt: "2025-06-04T10:00:00.000Z",
      },
      {
        uri: `at://${DEV_DID}/site.standard.document/design-principles`,
        title: "Design Principles",
        slug: "design-principles",
        createdAt: "2025-05-20T08:00:00.000Z",
        updatedAt: "2025-06-01T09:00:00.000Z",
      },
      {
        uri: `at://${DEV_DID}/site.standard.document/getting-started`,
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
        siteUrl: "https://norobots.blog",
        groups: [
          { slug: "engineering", title: "Engineering", articleCount: 4 },
          { slug: "getting-started", title: "Getting Started", articleCount: 2 },
        ],
      },
      {
        rkey: "perpetualsummer-ltd",
        title: "Perpetual Summer LTD",
        siteUrl: "https://perpetualsummer.ltd",
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
        slug: "my-first-post",
        publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        canonicalUrl: "https://norobots.blog/getting-started/my-first-post",
        assignments: [
          {
            siteTitle: "NoRobots.blog",
            siteRkey: "norobots-blog",
            siteAtUri: `at://${DEV_DID}/site.standard.publication/norobots-blog`,
            siteUrl: "norobots.blog",
            siteUrlPrefix: "",
            logoImageUrl: undefined,
            splashImageUrl: undefined,
            groupTitle: "Getting Started",
            groupSlug: "getting-started",
          },
        ],
      },
      {
        rkey: "second-post",
        uri: `at://${DEV_DID}/site.standard.document/second-post`,
        title: "Second Post",
        slug: "second-post",
        publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        canonicalUrl: "https://norobots.blog/second-post",
        assignments: [
          {
            siteTitle: "NoRobots.blog",
            siteRkey: "norobots-blog",
            siteAtUri: `at://${DEV_DID}/site.standard.publication/norobots-blog`,
            siteUrl: "norobots.blog",
            siteUrlPrefix: "",
            logoImageUrl: undefined,
            splashImageUrl: undefined,
            groupTitle: undefined,
            groupSlug: undefined,
          },
          {
            siteTitle: "Perpetual Summer LTD",
            siteRkey: "perpetualsummer-ltd",
            siteAtUri: `at://${DEV_DID}/site.standard.publication/perpetualsummer-ltd`,
            siteUrl: "perpetualsummer.ltd",
            siteUrlPrefix: "",
            logoImageUrl: undefined,
            splashImageUrl: undefined,
            groupTitle: undefined,
            groupSlug: undefined,
          },
        ],
      },
    ],
    standaloneArticles: [
      {
        rkey: "dev-standalone",
        uri: `at://${DEV_DID}/site.standard.document/dev-standalone`,
        title: "Dev Standalone Article",
        slug: "dev-standalone",
        cid: "dev-cid",
        createdAt: new Date().toISOString(),
        readerUrl: `https://reader.scribe-atp.app/${DEV_DID}/site.standard.document/dev-standalone`,
      },
    ],
    publishTargets: [
      {
        rkey: "norobots-blog",
        title: "NoRobots.blog",
        publicationUri: `at://${DEV_DID}/site.standard.publication/norobots-blog`,
        notifySubscribersEnabled: true,
        groups: [{ slug: "getting-started", title: "Getting Started" }],
      },
      {
        rkey: "perpetualsummer-ltd",
        title: "Perpetual Summer LTD",
        publicationUri: `at://${DEV_DID}/site.standard.publication/perpetualsummer-ltd`,
        notifySubscribersEnabled: true,
        groups: [],
      },
    ],
    authorDid: DEV_DID,
    authorHandle: "dev.user",
  };
}

// ── /article/create ───────────────────────────────────────────────────────────

export function devCreateLoader(): Record<string, never> {
  return {};
}

// ── /article/edit ─────────────────────────────────────────────────────────────

export function devEditLoader(articleUrl: string): {
  rkey: string;
  title: string;
  content: string;
  slug: string;
  splashImageUrl: string;
  description: string;
  tags: string[];
  contributors: { did: string; role: string; displayName: string }[];
  createdAt: string;
  cid: string;
  publishedSite: string;
  publishedAt: string;
  publishedPath: string;
} {
  return {
    rkey: "dev-tid-placeholder",
    title: "Dev mode article",
    content: "Dev mode content",
    slug: articleUrl,
    splashImageUrl: "",
    description: "",
    tags: [],
    contributors: [],
    createdAt: new Date().toISOString(),
    cid: "dev-cid",
    publishedSite: "",
    publishedAt: "",
    publishedPath: `/${articleUrl}`,
  };
}

// ── /article/list/:siteSlug ───────────────────────────────────────────────────

export function devSiteListLoader(siteSlug: string): {
  devMode: boolean;
  hasUnassignedArticles: boolean;
  contributors: RosterEntry[];
  site: SiteManifest;
} {
  return {
    devMode: true,
    // Dev fixture exercises the "other group has articles" empty-state case
    // below (getting-started is empty, engineering isn't) — the classic
    // "Drop articles here" DnD hint.
    hasUnassignedArticles: false,
    // Exercises both roster states the Contributors UI can show post-
    // reconciliation (rejected never reaches the loader's return value).
    contributors: [
      {
        did: `${DEV_DID}:contributor-1`,
        addedAt: "2026-07-01T00:00:00.000Z",
        status: "accepted",
        handle: "alice.bsky.social",
        displayName: "Alice",
        avatar: undefined,
      },
      {
        did: `${DEV_DID}:contributor-2`,
        addedAt: "2026-07-10T00:00:00.000Z",
        status: "invited",
        handle: "bob.bsky.social",
        displayName: "Bob",
        avatar: undefined,
      },
    ],
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
              uri: `at://${DEV_DID}/site.standard.document/hello-world`,
              title: "Hello World",
              slug: "hello-world",
              splashImageUrl: null,
              createdAt: "2025-01-01T00:00:00.000Z",
            },
          ],
        },
        {
          slug: "getting-started",
          title: "Getting Started",
          articles: [],
        },
      ],
      // Since ADR 0013, no UI path can populate ungroupedArticles anymore —
      // every document is either loose (outside any site) or published into
      // a named group. Kept as [] to match production reality.
      ungroupedArticles: [],
    },
  };
}

// ── /article/view ─────────────────────────────────────────────────────────────

export function devViewLoader(articleUrl: string) {
  return {
    title: "Dev mode article",
    content:
      "<p>This is placeholder content for dev mode. It gives a rough sense of how the article layout will look with real content.</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>",
    splashImageUrl: "",
    description: "A short description of the article shown as a lead paragraph.",
    createdAt: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
    publishedAt: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ["dev", "example"],
    readMinutes: 2,
    bskyPostRef: null,
    siteDomain: "norobots.blog",
    canonicalUrl: `https://norobots.blog/${articleUrl}`,
    readerUrl: `https://reader.scribe-atp.app/${DEV_DID}/site.standard.document/${articleUrl}`,
    slug: articleUrl,
    likes: 7,
    shares: 2,
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
      showInDiscover: true,
      notifySubscribersEnabled: true,
      umami: { configured: false as const },
    },
  };
}
