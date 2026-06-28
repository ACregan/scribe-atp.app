import { type SiteCard } from "./types";

/** Strips HTML tags to check whether the editor actually contains text. */
export function hasTextContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim() !== "";
}

export function composedUrl(site: SiteCard): string {
  return site.urlPrefix ? `${site.url}/${site.urlPrefix}` : site.url;
}

export function composedArticleUrl(
  siteUrl: string,
  siteUrlPrefix: string,
  groupSlug: string | undefined,
  articleSlug: string,
): string {
  const parts = ["https:/", siteUrl, siteUrlPrefix, groupSlug, articleSlug]
    .filter(Boolean)
    .join("/");
  return parts;
}

export function composedArticleDisplayPath(
  siteUrlPrefix: string,
  groupSlug: string | undefined,
  articleSlug: string,
): string {
  const parts = [siteUrlPrefix, groupSlug, articleSlug].filter(Boolean).join("/");
  return `.../${parts}`;
}

export function uniqueId(): string {
  const timestamp = Date.now().toString(36);
  const randomness = Math.random().toString(36).substring(2);
  return `${timestamp + randomness}`;
}
