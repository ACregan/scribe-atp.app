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
