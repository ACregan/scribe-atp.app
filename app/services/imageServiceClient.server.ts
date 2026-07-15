import type { BrowseResponse } from "~/components/ImagePickerModal/imageBrowserTypes";

const IMAGE_SERVICE_BASE = "http://localhost:3009/api/image-service";

export async function browseImages(
  folderId: string | null,
  cookieHeader: string,
): Promise<BrowseResponse> {
  const url = `${IMAGE_SERVICE_BASE}/browse${folderId ? `?folderId=${folderId}` : ""}`;
  const response = await fetch(url, {
    headers: { Cookie: cookieHeader },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Image Service returned ${response.status}`);
  }
  return response.json() as Promise<BrowseResponse>;
}

// ADR 0017/0020 — wholesale-replaces the Image Service's local site_rosters
// mirror for one site. Called from contributorRoster.server.ts (removeContributor,
// the accepted-promotion branch of reconcileContributorStatuses) and from
// sites.tsx's create action (empty memberDids, just to get the folder to
// exist). Same session-cookie-forwarding pattern as browseImages — no
// separate shared-secret mechanism, since the caller is always a real
// logged-in site owner acting in their own session.
export async function syncSiteRoster(
  siteUri: string,
  siteName: string,
  memberDids: string[],
  cookieHeader: string,
): Promise<void> {
  const response = await fetch(`${IMAGE_SERVICE_BASE}/site-roster`, {
    method: "PUT",
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ siteUri, siteName, memberDids }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Image Service returned ${response.status}`);
  }
}
