import { type SiteCard } from "./types";

export function composedUrl(site: SiteCard): string {
  return site.urlPrefix ? `${site.url}/${site.urlPrefix}` : site.url;
}
