import { useEffect, useState } from "react";
import { resolveIdentifier, PUBLIC_API } from "./utils";
import type { Site } from "./types";

async function fetchSite(author: string, siteSlug: string): Promise<Site> {
  const did = await resolveIdentifier(author);
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.scribe.site&rkey=${encodeURIComponent(siteSlug)}`,
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Site "${siteSlug}" not found`);
    throw new Error(`Failed to fetch site: ${res.statusText}`);
  }
  const { value } = await res.json();
  return {
    title: value.title ?? "",
    url: value.url ?? "",
    urlPrefix: value.urlPrefix ?? "",
    description: value.description,
    splashImageUrl: value.splashImageUrl,
    logoImageUrl: value.logoImageUrl,
    groups: value.groups ?? [],
    articles: value.articles ?? [],
  };
}

/**
 * Fetches an app.scribe.site record from the AT Protocol.
 * Returns the full site manifest: groups, ungrouped articles, and metadata.
 *
 * @param author  - Bluesky handle (e.g. "tony.bsky.social") or DID
 * @param siteSlug - The site rkey (e.g. "norobots-blog")
 *
 * @example
 * const { site, loading, error } = useSite("tony.bsky.social", "norobots-blog");
 * if (loading) return <Spinner />;
 * if (error) return <p>{error.message}</p>;
 * return site.groups.map(group => <GroupView key={group.slug} group={group} />);
 */
export function useSite(
  author: string,
  siteSlug: string,
): { site: Site | null; loading: boolean; error: Error | null } {
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSite(author, siteSlug)
      .then((data) => {
        if (!cancelled) setSite(data);
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
  }, [author, siteSlug]);

  return { site, loading, error };
}
