import { useEffect, useState } from "react";
import { resolveIdentifier, PUBLIC_API } from "./utils";
import type { Article } from "./types";

const ARTICLE_COLLECTION = "app.scribe.article";

async function fetchArticle(
  author: string,
  articleSlug: string,
): Promise<Article> {
  const did = await resolveIdentifier(author);
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${ARTICLE_COLLECTION}&rkey=${encodeURIComponent(articleSlug)}`,
  );
  if (!res.ok) {
    if (res.status === 404)
      throw new Error(`Article "${articleSlug}" not found`);
    throw new Error(`Failed to fetch article: ${res.statusText}`);
  }
  const { value } = await res.json();
  return {
    title: value.title ?? "",
    content: value.content ?? "",
    url: value.url ?? articleSlug,
    splashImageUrl: value.splashImageUrl,
    synopsis: value.synopsis,
    createdAt: value.createdAt ?? "",
  };
}

/**
 * Fetches an app.scribe.article record from the AT Protocol.
 * Returns the full article including HTML content.
 *
 * @param author      - Bluesky handle (e.g. "tony.bsky.social") or DID
 * @param articleSlug - The article rkey / url slug (e.g. "my-article-title")
 *
 * @example
 * // Render a single article page, where the slug comes from the URL
 * const { article, loading, error } = useArticle("tony.bsky.social", params.slug);
 * if (loading) return <Spinner />;
 * if (error) return <p>{error.message}</p>;
 * return <article dangerouslySetInnerHTML={{ __html: article.content }} />;
 *
 * @example
 * // Fetch an article whose URI came from a useSite() article ref
 * import { slugFromUri } from "./utils";
 * const slug = slugFromUri(articleRef.uri);
 * const { article } = useArticle("tony.bsky.social", slug);
 */
export function useArticle(
  author: string,
  articleSlug: string,
): { article: Article | null; loading: boolean; error: Error | null } {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchArticle(author, articleSlug)
      .then((data) => {
        if (!cancelled) setArticle(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [author, articleSlug]);

  return { article, loading, error };
}
