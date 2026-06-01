# Scribe ATP Public Hooks

This directory contains React hooks for consuming articles and groups from Scribe ATP sites directly via the AT Protocol. These hooks can be used in any website to display content created with Scribe ATP, without requiring authentication or an API backend.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Available Hooks](#available-hooks)
  - [usePublicSiteArticles](#usepublicsitearticles)
  - [useSiteArticlesDirect](#usesitearticlesdirect)
  - [useSiteGroupsDirect](#usesitegroupsdirect)
  - [useSiteArticles](#usesitearticles)
- [Helper Functions](#helper-functions)
- [TypeScript Types](#typescript-types)
- [Examples](#examples)
- [How It Works](#how-it-works)

## Overview

Scribe ATP stores articles and site configurations in users' Personal Data Servers (PDS) using the AT Protocol. AT Protocol repositories are **publicly readable**, meaning anyone can fetch and display this content without authentication.

These hooks leverage this public read access to allow you to:

- Display articles from any Scribe ATP site
- Filter articles by group
- Access site metadata and structure
- Build custom frontends, blog readers, or content aggregators

## Installation

The hooks are located in `app/hooks/` and can be imported from `~/hooks`:

```tsx
import {
  usePublicSiteArticles,
  useSiteArticlesDirect,
  useSiteGroupsDirect,
  useSiteArticles,
} from "~/hooks";
```

You can also import the TypeScript types:

```tsx
import { SiteData, SiteArticleRef, SiteGroup } from "~/hooks";
```

## Available Hooks

### usePublicSiteArticles

The main hook for fetching site data directly from the AT Protocol.

**Signature:**

```tsx
function usePublicSiteArticles(
  authorDid: string,
  siteSlug: string,
  groupSlug?: string,
): {
  data: {
    site: SiteData | null;
    allArticles(): SiteArticleRef[];
    getArticlesByGroup(groupSlug: string): SiteArticleRef[];
    getArticleBySlug(slug: string): SiteArticleRef | undefined;
    getArticleByUri(uri: string): SiteArticleRef | undefined;
    groups(): SiteGroup[];
    getGroupBySlug(groupSlug: string): SiteGroup | undefined;
    isArticleInAnyGroup(articleUri: string): boolean;
    getUngroupedArticles(): SiteArticleRef[];
  } | null;
  loading: boolean;
  error: Error | null;
};
```

**Parameters:**

- `authorDid` - The author's Bluesky handle (e.g., `"user.bsky.social"`) or DID (e.g., `"did:plc:xyz123..."`)
- `siteSlug` - The site identifier (rkey), e.g., `"norobots-blog"`
- `groupSlug` - (Optional) Filter to only include articles from a specific group

**Returns:**

- `data` - Object containing site data and query methods (or `null` while loading/on error)
- `loading` - Boolean indicating if data is being fetched
- `error` - Error object if the fetch failed, or `null`

**Example:**

```tsx
const { data, loading, error } = usePublicSiteArticles(
  "user.bsky.social",
  "norobots-blog",
);

if (loading) return <div>Loading...</div>;
if (error) return <div>Error: {error.message}</div>;
if (!data) return null;

return (
  <div>
    <h1>{data.site?.title}</h1>
    <ul>
      {data.allArticles().map((article) => (
        <li key={article.uri}>
          <a href={`/article/${slugFromUri(article.uri)}`}>{article.title}</a>
        </li>
      ))}
    </ul>
  </div>
);
```

### useSiteArticlesDirect

A simplified hook that returns only the articles array.

**Signature:**

```tsx
function useSiteArticlesDirect(
  authorDid: string,
  siteSlug: string,
  groupSlug?: string,
): {
  articles: SiteArticleRef[];
  loading: boolean;
  error: Error | null;
};
```

**Parameters:**

- Same as `usePublicSiteArticles`

**Returns:**

- `articles` - Array of all articles (or filtered by group if `groupSlug` provided)
- `loading` - Boolean indicating if data is being fetched
- `error` - Error object if the fetch failed, or `null`

**Example:**

```tsx
const { articles, loading, error } = useSiteArticlesDirect(
  "user.bsky.social",
  "norobots-blog",
  "engineering", // Only get articles in the "engineering" group
);

if (loading) return <div>Loading...</div>;
if (error) return <div>Error: {error.message}</div>;

return (
  <ul>
    {articles.map((article) => (
      <li key={article.uri}>{article.title}</li>
    ))}
  </ul>
);
```

### useSiteGroupsDirect

A hook that returns only the groups array.

**Signature:**

```tsx
function useSiteGroupsDirect(
  authorDid: string,
  siteSlug: string,
): {
  groups: SiteGroup[];
  loading: boolean;
  error: Error | null;
};
```

**Parameters:**

- `authorDid` - The author's Bluesky handle or DID
- `siteSlug` - The site identifier (rkey)

**Returns:**

- `groups` - Array of all groups in the site
- `loading` - Boolean indicating if data is being fetched
- `error` - Error object if the fetch failed, or `null`

**Example:**

```tsx
const { groups, loading, error } = useSiteGroupsDirect(
  "user.bsky.social",
  "norobots-blog",
);

if (loading) return <div>Loading...</div>;
if (error) return <div>Error: {error.message}</div>;

return (
  <div>
    <h2>Categories</h2>
    <ul>
      {groups.map((group) => (
        <li key={group.slug}>
          <strong>{group.title}</strong> ({group.articles.length} articles)
        </li>
      ))}
    </ul>
  </div>
);
```

### useSiteArticles

A hook for consuming site data when you already have it (e.g., from a server-side loader). This is useful in React Router routes where data is fetched server-side.

**Signature:**

```tsx
function useSiteArticles(site: SiteData | null | undefined): {
  site: SiteData | null | undefined;
  allArticles(): SiteArticleRef[];
  getArticlesByGroup(groupSlug: string): SiteArticleRef[];
  getArticleBySlug(slug: string): SiteArticleRef | undefined;
  getArticleByUri(uri: string): SiteArticleRef | undefined;
  groups(): SiteGroup[];
  getGroupBySlug(groupSlug: string): SiteGroup | undefined;
  isArticleInAnyGroup(articleUri: string): boolean;
  getUngroupedArticles(): SiteArticleRef[];
};
```

**Parameters:**

- `site` - The site data object (typically from a loader)

**Example:**

```tsx
// In a React Router route component
export async function loader({ params }: LoaderFunctionArgs) {
  // Fetch site data server-side
  const site = await fetchSiteFromPds(params.authorDid, params.siteSlug);
  return { site };
}

export default function SitePage({ loaderData }: Route.ComponentProps) {
  const { site } = loaderData;
  const { allArticles, groups } = useSiteArticles(site);

  return (
    <div>
      <h1>{site?.title}</h1>
      <h2>Articles</h2>
      <ul>
        {allArticles().map((article) => (
          <li key={article.uri}>{article.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Helper Functions

These utility functions are also exported:

```tsx
// Extract article slug from AT Protocol URI
slugFromUri("at://did:plc:xyz/app.scribe.article/hello-world");
// Returns: "hello-world"

// Flatten all articles from a site (grouped + ungrouped)
flattenSiteArticles(siteData);

// Get articles from a specific group
getGroupArticles(siteData, "engineering");

// Get all group slugs
getGroupSlugs(siteData);

// Check if article is in a group
isArticleInGroup(siteData, "engineering", articleUri);

// Find which group contains an article
findArticleGroup(siteData, articleUri);
```

## TypeScript Types

All types are exported for use in your components:

```tsx
interface SiteArticleRef {
  uri: string; // Full AT URI: at://did/app.scribe.article/slug
  title: string;
  splashImageUrl: string | null;
  createdAt: string; // ISO 8601 date string
}

interface SiteGroup {
  slug: string; // URL-safe group identifier
  title: string;
  articles: SiteArticleRef[];
}

interface SiteData {
  rkey: string; // Site identifier (same as siteSlug)
  cid: string; // Content identifier (AT Protocol)
  url: string; // Domain name (e.g., "norobots.blog")
  title: string;
  urlPrefix: string; // Path prefix (e.g., "blog")
  groups: SiteGroup[];
  articles: SiteArticleRef[]; // Ungrouped articles
}
```

## Examples

### Basic Article List

```tsx
import { useSiteArticlesDirect, slugFromUri } from "~/hooks";

export default function ArticleList({ authorDid, siteSlug }) {
  const { articles, loading, error } = useSiteArticlesDirect(
    authorDid,
    siteSlug,
  );

  if (loading) return <div>Loading articles...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="article-list">
      {articles.map((article) => (
        <article key={article.uri} className="article-card">
          {article.splashImageUrl && (
            <img src={article.splashImageUrl} alt="" />
          )}
          <h2>
            <a href={`/article/${slugFromUri(article.uri)}`}>{article.title}</a>
          </h2>
          <time dateTime={article.createdAt}>
            {new Date(article.createdAt).toLocaleDateString()}
          </time>
        </article>
      ))}
    </div>
  );
}
```

### Grouped Articles with Navigation

```tsx
import { usePublicSiteArticles, slugFromUri } from "~/hooks";

export default function SiteWithGroups({ authorDid, siteSlug }) {
  const { data, loading, error } = usePublicSiteArticles(authorDid, siteSlug);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return null;

  return (
    <div className="site">
      <header>
        <h1>{data.site?.title}</h1>
        {data.site?.description && <p>{data.site.description}</p>}
      </header>

      {/* Group Navigation */}
      <nav>
        <ul>
          <li>
            <a href="#all">All Articles</a>
          </li>
          {data.groups().map((group) => (
            <li key={group.slug}>
              <a href={`#group-${group.slug}`}>{group.title}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* All Articles */}
      <section id="all">
        <h2>All Articles</h2>
        <ul>
          {data.allArticles().map((article) => (
            <li key={article.uri}>
              <a href={`/article/${slugFromUri(article.uri)}`}>
                {article.title}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Articles by Group */}
      {data.groups().map((group) => (
        <section key={group.slug} id={`group-${group.slug}`}>
          <h2>{group.title}</h2>
          <ul>
            {group.articles.map((article) => (
              <li key={article.uri}>
                <a href={`/article/${slugFromUri(article.uri)}`}>
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

### Article Grid with Filtering

```tsx
import { useState } from "react";
import { usePublicSiteArticles, slugFromUri } from "~/hooks";

export default function ArticleGrid({ authorDid, siteSlug }) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const { data, loading, error } = usePublicSiteArticles(
    authorDid,
    siteSlug,
    selectedGroup || undefined,
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return null;

  const articles = selectedGroup
    ? data.getArticlesByGroup(selectedGroup)
    : data.allArticles();

  return (
    <div>
      {/* Group Filter */}
      <div className="filters">
        <button
          className={!selectedGroup ? "active" : ""}
          onClick={() => setSelectedGroup(null)}
        >
          All
        </button>
        {data.groups().map((group) => (
          <button
            key={group.slug}
            className={selectedGroup === group.slug ? "active" : ""}
            onClick={() => setSelectedGroup(group.slug)}
          >
            {group.title}
          </button>
        ))}
      </div>

      {/* Article Grid */}
      <div className="article-grid">
        {articles.map((article) => (
          <article key={article.uri} className="article-card">
            {article.splashImageUrl && (
              <img src={article.splashImageUrl} alt="" />
            )}
            <h3>{article.title}</h3>
            <a href={`/article/${slugFromUri(article.uri)}`}>Read More</a>
          </article>
        ))}
      </div>
    </div>
  );
}
```

### RSS Feed Generator

```tsx
import { useSiteArticlesDirect } from "~/hooks";

export default function RSSFeed({ authorDid, siteSlug }) {
  const { articles, loading, error } = useSiteArticlesDirect(
    authorDid,
    siteSlug,
  );

  if (loading || error || !articles.length) return null;

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${siteTitle}</title>
    <link>${siteUrl}</link>
    ${articles
      .map(
        (article) => `
      <item>
        <title>${article.title}</title>
        <link>${siteUrl}/article/${slugFromUri(article.uri)}</link>
        <pubDate>${new Date(article.createdAt).toUTCString()}</pubDate>
      </item>
    `,
      )
      .join("")}
  </channel>
</rss>`;

  return (
    <a href={`data:application/rss+xml,${encodeURIComponent(rss)}`}>
      Subscribe to RSS Feed
    </a>
  );
}
```

## How It Works

1. **Handle Resolution**: If you provide a Bluesky handle (e.g., `user.bsky.social`), the hook first resolves it to a DID using the AT Protocol identity service.

2. **PDS Discovery**: The hook uses the public AT Protocol endpoint (`https://public.api.bsky.app`) to access the user's PDS.

3. **Record Fetching**: The hook fetches the `app.scribe.site` record with the specified `rkey` (site slug).

4. **Data Parsing**: The raw AT Protocol record is parsed into the `SiteData` structure, including groups and article references.

5. **Client-Side Filtering**: If a `groupSlug` is provided, the hook filters the articles client-side to only include those in the specified group.

### AT Protocol Endpoints Used

- **Handle Resolution**: `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle`
- **Record Fetching**: `https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord`

### No Authentication Required

AT Protocol repositories are publicly readable by design. This means:

- No API keys needed
- No OAuth tokens required
- No backend proxy necessary
- Works in any browser environment

This makes it easy to build custom frontends, mobile apps, or content aggregators that display Scribe ATP content.
