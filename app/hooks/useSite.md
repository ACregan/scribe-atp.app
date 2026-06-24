# useSite

Fetches an `app.scribe.site` record from the AT Protocol and returns the full site manifest: groups, ungrouped articles, and metadata. No authentication required — AT Protocol repositories are publicly readable.

```ts
import { useSite } from "~/hooks";

const { site, loading, error } = useSite(author, siteSlug);
```

## Parameters

| Param | Type | Description |
|---|---|---|
| `author` | `string` | Bluesky handle (e.g. `"tony.bsky.social"`) or DID (e.g. `"did:plc:abc123"`) |
| `siteSlug` | `string` | The site's rkey as set in Scribe (e.g. `"norobots-blog"`) |

## Returns

| Field | Type | Description |
|---|---|---|
| `site` | `Site \| null` | The site record, or `null` while loading or on error |
| `loading` | `boolean` | `true` until the first response arrives |
| `error` | `Error \| null` | Set if the fetch or handle resolution failed |

### `Site` shape

```ts
{
  title: string;
  url: string;           // domain, e.g. "norobots.blog"
  urlPrefix: string;     // path prefix, e.g. "blog"
  description?: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groups: SiteGroup[];   // ordered; each group has its own ordered articles
  articles: ArticleRef[]; // top-level ungrouped articles
}

// SiteGroup
{ slug: string; title: string; articles: ArticleRef[] }

// ArticleRef — cached snapshot; does NOT include article body content
{
  uri: string;
  title: string;
  slug?: string;           // article slug — same as rkey, convenient for routing
  splashImageUrl: string | null;
  description?: string | null;
  tags?: string[];
  createdAt: string;       // ISO 8601
  publishedAt?: string;    // ISO 8601
  updatedAt?: string;      // ISO 8601 — absent on older refs
}
```

> **Note:** `ArticleRef` contains only the metadata cached in the site record. To render the article body, fetch the full record with [`useArticle`](./useArticle.md).

## Examples

### Render all groups and their articles

```tsx
import { useSite } from "~/hooks";

export function BlogIndex() {
  const { site, loading, error } = useSite("tony.bsky.social", "norobots-blog");

  if (loading) return <p>Loading…</p>;
  if (error)   return <p>Error: {error.message}</p>;

  return (
    <>
      <h1>{site.title}</h1>
      {site.groups.map((group) => (
        <section key={group.slug}>
          <h2>{group.title}</h2>
          <ul>
            {group.articles.map((article) => (
              <li key={article.uri}>
                <a href={`/blog/${slugFromUri(article.uri)}`}>{article.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
```

### Render all articles as a flat list (ignoring groups)

```tsx
import { useSite, flattenArticles, slugFromUri } from "~/hooks";

const { site } = useSite("tony.bsky.social", "norobots-blog");
const articles = site ? flattenArticles(site) : [];

return (
  <ul>
    {articles.map((a) => (
      <li key={a.uri}>
        <a href={`/blog/${slugFromUri(a.uri)}`}>{a.title}</a>
      </li>
    ))}
  </ul>
);
```

### Render ungrouped articles only

```tsx
const { site } = useSite("tony.bsky.social", "norobots-blog");

site?.articles.map((a) => ...);
```

### Use site metadata

```tsx
const { site } = useSite("tony.bsky.social", "norobots-blog");

return (
  <header>
    {site?.logoImageUrl && <img src={site.logoImageUrl} alt={site.title} />}
    <h1>{site?.title}</h1>
    <p>{site?.description}</p>
  </header>
);
```
