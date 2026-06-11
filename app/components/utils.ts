import { type SiteCard } from "./types";

/** Strips HTML tags to check whether the editor actually contains text. */
export function hasTextContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim() !== "";
}

export function composedUrl(site: SiteCard): string {
  return site.urlPrefix ? `${site.url}/${site.urlPrefix}` : site.url;
}
