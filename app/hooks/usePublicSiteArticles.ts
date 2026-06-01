import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Article reference structure as stored in site records.
 */
export interface SiteArticleRef {
  uri: string;
  title: string;
  splashImageUrl: string | null;
  createdAt: string;
}

/**
 * Group structure as stored in site records.
 */
export interface SiteGroup {
  slug: string;
  title: string;
  articles: SiteArticleRef[];
}

/**
 * Complete site data structure.
 */
export interface SiteData {
  rkey: string;
  cid: string;
  url: string;
  title: string;
  urlPrefix: string;
  groups: SiteGroup[];
  articles: SiteArticleRef[];
}

/**
 * Extracts the article slug from an AT Protocol URI.
 */
export function slugFromUri(uri: string): string {
  return uri.split("/").pop()!;
}

/**
 * Flattens all articles from a site into a single array.
 */
export function flattenSiteArticles(site: SiteData): SiteArticleRef[] {
  const grouped = site.groups.flatMap((g) => g.articles ?? []);
  const ungrouped = site.articles ?? [];
  return [...grouped, ...ungrouped];
}

/**
 * Gets all articles belonging to a specific group within a site.
 */
export function getGroupArticles(
  site: SiteData,
  groupSlug: string,
): SiteArticleRef[] {
  const group = site.groups.find((g) => g.slug === groupSlug);
  return group?.articles ?? [];
}

/**
 * Gets all group slugs for a site.
 */
export function getGroupSlugs(site: SiteData): string[] {
  return site.groups.map((g) => g.slug);
}

/**
 * Checks if an article is in a specific group.
 */
export function isArticleInGroup(
  site: SiteData,
  groupSlug: string,
  articleUri: string,
): boolean {
  const group = site.groups.find((g) => g.slug === groupSlug);
  if (!group) return false;
  return group.articles.some((a) => a.uri === articleUri);
}

/**
 * Finds which group (if any) contains a specific article.
 */
export function findArticleGroup(
  site: SiteData,
  articleUri: string,
): string | null {
  for (const group of site.groups) {
    if (group.articles.some((a) => a.uri === articleUri)) {
      return group.slug;
    }
  }
  return null;
}

/**
 * Resolves a Bluesky handle to a DID.
 * This is needed to fetch public records from a user's PDS.
 */
async function resolveHandleToDid(handle: string): Promise<string> {
  const response = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to resolve handle: ${response.statusText}`);
  }
  const data = await response.json();
  return data.did;
}

/**
 * Fetches a site record from a user's PDS using the AT Protocol.
 *
 * @param did - The user's DID (or handle that will be resolved to a DID)
 * @param siteSlug - The site identifier (rkey)
 * @returns The site data
 */
async function fetchSiteFromPds(
  did: string,
  siteSlug: string,
): Promise<SiteData> {
  // Resolve handle to DID if needed
  const resolvedDid = did.startsWith("did:")
    ? did
    : await resolveHandleToDid(did);

  // Determine the PDS endpoint
  // For did:plc: identifiers, we can use the public API
  // For other DIDs, we may need to resolve the PDS endpoint
  const pdsEndpoint = "https://public.api.bsky.app";

  const response = await fetch(
    `${pdsEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(resolvedDid)}&collection=app.scribe.site&rkey=${encodeURIComponent(siteSlug)}`,
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Site "${siteSlug}" not found`);
    }
    throw new Error(`Failed to fetch site: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    rkey: siteSlug,
    cid: data.cid || "",
    url: data.value.url || "",
    title: data.value.title || "",
    urlPrefix: data.value.urlPrefix || "",
    groups: data.value.groups || [],
    articles: data.value.articles || [],
  } as SiteData;
}

/**
 * Hook to consume articles from a site data object.
 * Provides methods to get all articles, articles by group, and article metadata.
 *
 * @param site - The site data object
 * @returns Object with article query methods and computed data
 *
 * @example
 * ```tsx
 * const { site } = loaderData;
 * const { allArticles, getArticlesByGroup, getArticleBySlug, groups } = useSiteArticles(site);
 * ```
 */
export function useSiteArticles(site: SiteData | null | undefined) {
  const siteRef = useRef(site);
  siteRef.current = site;

  const allArticles = useCallback((): SiteArticleRef[] => {
    if (!siteRef.current) return [];
    return flattenSiteArticles(siteRef.current);
  }, []);

  const getArticlesByGroup = useCallback(
    (groupSlug: string): SiteArticleRef[] => {
      if (!siteRef.current) return [];
      return getGroupArticles(siteRef.current, groupSlug);
    },
    [],
  );

  const getArticleBySlug = useCallback(
    (slug: string): SiteArticleRef | undefined => {
      if (!siteRef.current) return undefined;
      const all = flattenSiteArticles(siteRef.current);
      return all.find((a) => slugFromUri(a.uri) === slug);
    },
    [],
  );

  const getArticleByUri = useCallback(
    (uri: string): SiteArticleRef | undefined => {
      if (!siteRef.current) return undefined;
      const all = flattenSiteArticles(siteRef.current);
      return all.find((a) => a.uri === uri);
    },
    [],
  );

  const groups = useCallback((): SiteGroup[] => {
    if (!siteRef.current) return [];
    return siteRef.current.groups;
  }, []);

  const getGroupBySlug = useCallback(
    (groupSlug: string): SiteGroup | undefined => {
      if (!siteRef.current) return undefined;
      return siteRef.current.groups.find((g) => g.slug === groupSlug);
    },
    [],
  );

  const isArticleInAnyGroup = useCallback((articleUri: string): boolean => {
    if (!siteRef.current) return false;
    return findArticleGroup(siteRef.current, articleUri) !== null;
  }, []);

  const getUngroupedArticles = useCallback((): SiteArticleRef[] => {
    if (!siteRef.current) return [];
    return siteRef.current.articles ?? [];
  }, []);

  return {
    /** Site data object */
    site,
    /** Get all articles (grouped + ungrouped) as a flat array */
    allArticles,
    /** Get articles belonging to a specific group */
    getArticlesByGroup,
    /** Get a single article by its URL slug */
    getArticleBySlug,
    /** Get a single article by its full AT Protocol URI */
    getArticleByUri,
    /** Get all groups */
    groups,
    /** Get a specific group by its slug */
    getGroupBySlug,
    /** Check if an article belongs to any group */
    isArticleInAnyGroup,
    /** Get articles that are not in any group (top-level) */
    getUngroupedArticles,
  };
}

/**
 * Hook to fetch and consume articles directly from the AT Protocol.
 * This hook fetches site data directly from a user's PDS without requiring
 * an API route or authentication.
 *
 * @param authorDid - The author's DID or handle (e.g., "user.bsky.social")
 * @param siteSlug - The site identifier (rkey)
 * @param groupSlug - Optional group identifier to filter articles
 * @returns Object with loading state, error, and article query methods
 *
 * @example
 * ```tsx
 * // Fetch all articles for a site
 * const { data, loading, error } = usePublicSiteArticles("user.bsky.social", "norobots-blog");
 *
 * // Fetch articles from a specific group
 * const { data, loading, error } = usePublicSiteArticles("user.bsky.social", "norobots-blog", "engineering");
 *
 * if (loading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 *
 * return (
 *   <ul>
 *     {data.allArticles().map(article => (
 *       <li key={article.uri}>{article.title}</li>
 *     ))}
 *   </ul>
 * );
 * ```
 */
export function usePublicSiteArticles(
  authorDid: string,
  siteSlug: string,
  groupSlug?: string,
): {
  data: ReturnType<typeof useSiteArticles> | null;
  loading: boolean;
  error: Error | null;
} {
  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!authorDid || !siteSlug) {
      setError(new Error("Author DID and site slug are required"));
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchSiteData() {
      try {
        setLoading(true);
        setError(null);

        const siteData = await fetchSiteFromPds(authorDid, siteSlug);

        if (mounted) {
          // If a group filter is specified, create a filtered version of the site
          if (groupSlug) {
            const group = siteData.groups.find((g) => g.slug === groupSlug);
            if (!group) {
              throw new Error(`Group "${groupSlug}" not found`);
            }
            setSite({
              ...siteData,
              articles: group.articles,
              groups: [group],
            });
          } else {
            setSite(siteData);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchSiteData();

    return () => {
      mounted = false;
    };
  }, [authorDid, siteSlug, groupSlug]);

  const siteData = useSiteArticles(site);
  const data = site ? siteData : null;

  return { data, loading, error };
}

/**
 * Hook to fetch all articles for a site directly from the AT Protocol.
 * This is a convenience wrapper around usePublicSiteArticles that only
 * returns the articles array.
 *
 * @param authorDid - The author's DID or handle
 * @param siteSlug - The site identifier (rkey)
 * @param groupSlug - Optional group identifier to filter articles
 * @returns Object with articles array, loading state, and error
 *
 * @example
 * ```tsx
 * const { articles, loading, error } = useSiteArticlesDirect("user.bsky.social", "norobots-blog");
 * ```
 */
export function useSiteArticlesDirect(
  authorDid: string,
  siteSlug: string,
  groupSlug?: string,
): {
  articles: SiteArticleRef[];
  loading: boolean;
  error: Error | null;
} {
  const { data, loading, error } = usePublicSiteArticles(
    authorDid,
    siteSlug,
    groupSlug,
  );

  const articles = data ? data.allArticles() : [];

  return { articles, loading, error };
}

/**
 * Hook to fetch all groups for a site directly from the AT Protocol.
 *
 * @param authorDid - The author's DID or handle
 * @param siteSlug - The site identifier (rkey)
 * @returns Object with groups array, loading state, and error
 *
 * @example
 * ```tsx
 * const { groups, loading, error } = useSiteGroupsDirect("user.bsky.social", "norobots-blog");
 * ```
 */
export function useSiteGroupsDirect(
  authorDid: string,
  siteSlug: string,
): {
  groups: SiteGroup[];
  loading: boolean;
  error: Error | null;
} {
  const { data, loading, error } = usePublicSiteArticles(authorDid, siteSlug);

  const groups = data ? data.groups() : [];

  return { groups, loading, error };
}
