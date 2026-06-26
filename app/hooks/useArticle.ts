import { useEffect, useState } from "react";
import { resolveIdentifier, PUBLIC_API } from "./utils";
import type { Article } from "./types";

const DOCUMENT_COLLECTION = "site.standard.document";

async function fetchArticle(
  author: string,
  articleSlug: string,
): Promise<Article> {
  const did = await resolveIdentifier(author);

  // Resolve slug → record via listRecords scan (rkeys are TIDs, not slugs)
  let cursor: string | undefined;
  do {
    const url = new URL(`${PUBLIC_API}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", DOCUMENT_COLLECTION);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Failed to fetch articles: ${res.statusText}`);
    const data = await res.json();

    for (const record of data.records ?? []) {
      const path = String(record.value?.path ?? "");
      if (path.split("/").pop() === articleSlug) {
        const value = record.value as Record<string, unknown>;
        const rawContent = value.content;
        const content =
          typeof rawContent === "object" &&
          rawContent !== null &&
          (rawContent as Record<string, unknown>).$type === "app.scribe.content.html"
            ? String((rawContent as Record<string, unknown>).html ?? "")
            : String(rawContent ?? "");
        return {
          title: String(value.title ?? ""),
          content,
          slug: articleSlug,
          splashImageUrl: value.splashImageUrl ? String(value.splashImageUrl) : undefined,
          description: value.description ? String(value.description) : undefined,
          createdAt: String(value.createdAt ?? ""),
          updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
        };
      }
    }

    cursor = data.cursor;
  } while (cursor);

  throw new Error(`Article "${articleSlug}" not found`);
}

/**
 * Fetches a site.standard.document record from the AT Protocol by slug.
 * Returns the full article including HTML content.
 *
 * @param author      - Bluesky handle (e.g. "tony.bsky.social") or DID
 * @param articleSlug - The article URL slug (e.g. "my-article-title")
 *
 * @example
 * const { article, loading, error } = useArticle("tony.bsky.social", params.slug);
 * if (loading) return <Spinner />;
 * if (error) return <p>{error.message}</p>;
 * return <article dangerouslySetInnerHTML={{ __html: article.content }} />;
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
