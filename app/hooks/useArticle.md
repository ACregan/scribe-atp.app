# useArticle

Fetches an article from the AT Protocol (tries `site.standard.document` first, falls back to `app.scribe.article` for drafts) and returns the full article, including the HTML body content. No authentication required — AT Protocol repositories are publicly readable.

```ts
import { useArticle } from "~/hooks";

const { article, loading, error } = useArticle(author, articleSlug);
```

## Parameters

| Param | Type | Description |
|---|---|---|
| `author` | `string` | Bluesky handle (e.g. `"tony.bsky.social"`) or DID (e.g. `"did:plc:abc123"`) |
| `articleSlug` | `string` | The article's rkey / URL slug (e.g. `"my-article-title"`) |

## Returns

| Field | Type | Description |
|---|---|---|
| `article` | `Article \| null` | The article record, or `null` while loading or on error |
| `loading` | `boolean` | `true` until the first response arrives |
| `error` | `Error \| null` | Set if the fetch or handle resolution failed |

### `Article` shape

```ts
{
  title: string;
  content: string;        // HTML — render with dangerouslySetInnerHTML
  slug: string;           // the slug, same as articleSlug
  splashImageUrl?: string;
  description?: string;
  createdAt: string;      // ISO 8601 — Scribe extension, set once on create
  updatedAt?: string;     // ISO 8601 — set on create and updated on every edit
}
```

> **Note:** `content` is HTML produced by the Scribe rich text editor. Render it with `dangerouslySetInnerHTML` or a sanitising library like DOMPurify if you do not control the content source.

## Examples

### Render an article page (slug from URL params)

```tsx
import { useArticle } from "~/hooks";

export function ArticlePage({ params }: { params: { slug: string } }) {
  const { article, loading, error } = useArticle("tony.bsky.social", params.slug);

  if (loading) return <p>Loading…</p>;
  if (error)   return <p>Error: {error.message}</p>;

  return (
    <article>
      <h1>{article.title}</h1>
      {article.splashImageUrl && (
        <img src={article.splashImageUrl} alt={article.title} />
      )}
      <time dateTime={article.createdAt}>
        {new Date(article.createdAt).toLocaleDateString()}
      </time>
      <div dangerouslySetInnerHTML={{ __html: article.content }} />
    </article>
  );
}
```

### Navigate from a site article ref to the full article

Article refs in the `useSite` response contain an AT URI, not a slug directly. Use `slugFromUri` to extract the slug for routing and for `useArticle`.

```tsx
import { useSite, useArticle, slugFromUri } from "~/hooks";

// On the index page — build links from article refs
const { site } = useSite("tony.bsky.social", "norobots-blog");

site?.groups[0].articles.map((ref) => {
  const slug = slugFromUri(ref.uri); // "my-article-title"
  return <a key={slug} href={`/blog/${slug}`}>{ref.title}</a>;
});

// On the article page — fetch the full record by slug
const { article } = useArticle("tony.bsky.social", params.slug);
```

### Show a loading skeleton while fetching

```tsx
const { article, loading } = useArticle("tony.bsky.social", params.slug);

if (loading) {
  return (
    <article>
      <div className="skeleton-title" />
      <div className="skeleton-body" />
    </article>
  );
}
```
