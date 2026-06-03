import { type SiteData } from "./types";

export function composedUrl(site: SiteData): string {
  return site.urlPrefix ? `${site.url}/${site.urlPrefix}` : site.url;
}
