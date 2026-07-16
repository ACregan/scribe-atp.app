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

// ADR 0024 — folder creation only, no roster to push. Contributor access is
// decided by the Image Service reading contributor_memberships live. Called
// from sites.tsx's create action and configure.tsx's "Resync Image Folder"
// button. Same session-cookie-forwarding pattern as browseImages — no
// separate shared-secret mechanism, since the caller is always a real
// logged-in site owner acting in their own session.
export async function ensureSiteFolder(
  siteUri: string,
  siteName: string,
  cookieHeader: string,
): Promise<void> {
  const response = await fetch(`${IMAGE_SERVICE_BASE}/site-folder`, {
    method: "PUT",
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ siteUri, siteName }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Image Service returned ${response.status}`);
  }
}
