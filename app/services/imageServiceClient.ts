export type {
  BrowseFolder,
  BrowseImage,
  BrowseResponse,
} from "~/components/ImagePickerModal/imageBrowserTypes";
import type { BrowseResponse } from "~/components/ImagePickerModal/imageBrowserTypes";

export type FolderOption = {
  id: number;
  name: string;
  parent_id: number | null;
};
export type BulkCounts = { folderCount: number; imageCount: number };

export class ImageServiceError extends Error {}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ImageServiceError(data.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ── Folders ───────────────────────────────────────────────────────────────────

export async function getMyFolders(): Promise<FolderOption[]> {
  const data = await request<{ folders: FolderOption[] }>(
    "/api/image-service/folders/mine",
  );
  return data.folders;
}

export async function createFolder(
  name: string,
  parentId: number,
): Promise<{ id: number }> {
  const data = await request<{ folder: { id: number } }>(
    "/api/image-service/folders",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    },
  );
  return data.folder;
}

export async function deleteFolder(folderId: number): Promise<void> {
  await request(`/api/image-service/folders/${folderId}`, {
    method: "DELETE",
  });
}

// ── Images ────────────────────────────────────────────────────────────────────

export async function deleteImage(imageId: number): Promise<void> {
  await request(`/api/image-service/images/${imageId}`, { method: "DELETE" });
}

export async function moveImage(
  imageId: number,
  folderId: number,
): Promise<void> {
  await request(`/api/image-service/images/${imageId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId }),
  });
}

// ── Bulk operations ───────────────────────────────────────────────────────────

export async function bulkMove(
  imageIds: number[],
  folderIds: number[],
  destinationFolderId: number,
): Promise<void> {
  await request("/api/image-service/bulk-move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageIds, folderIds, destinationFolderId }),
  });
}

export async function getBulkDeleteCounts(
  imageIds: number[],
  folderIds: number[],
): Promise<BulkCounts> {
  return request<BulkCounts>("/api/image-service/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageIds, folderIds }),
  });
}

export async function bulkDelete(
  imageIds: number[],
  folderIds: number[],
): Promise<void> {
  await request("/api/image-service/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageIds, folderIds, confirm: true }),
  });
}

// ── Browse ────────────────────────────────────────────────────────────────────

export async function browseFolders(
  folderId?: number,
): Promise<BrowseResponse> {
  const url = folderId
    ? `/api/image-service/browse?folderId=${folderId}`
    : "/api/image-service/browse";
  return request<BrowseResponse>(url);
}

// ── Upload (XHR + SSE — callers manage progress and cancellation) ─────────────

export const UPLOAD_URL = "/api/image-service/upload";

export function progressUrl(uploadId: string): string {
  return `/api/image-service/progress/${uploadId}`;
}
