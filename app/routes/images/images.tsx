import type { Route } from "./+types/images";
import { Link, useRevalidator } from "react-router";
import { useState } from "react";
import { requireAuth, useRealOAuth } from "~/services/auth.server";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";
import { UploadModal } from "./UploadModal";
import { NewFolderModal } from "./NewFolderModal";
import { MoveImageModal } from "./MoveImageModal";
import { Spinner } from "~/components/Spinner/Spinner";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import styles from "./images.module.css";

type BrowseFolder = {
  id: number;
  user_did: string;
  name: string;
  parent_id: number | null;
  created_at?: string;
};

type BrowseImage = {
  id: number;
  user_did: string;
  filename: string;
  original_name: string;
  width: number;
  height: number;
  sizes: Record<string, { width: number; height: number }>;
  created_at: string;
};

type LoaderData = {
  currentUserDid: string;
  folder: BrowseFolder | null;
  breadcrumbs: Array<{ id: number; name: string }>;
  subfolders: BrowseFolder[];
  images: BrowseImage[];
};

const VARIANT_ORDER = ["thumb", "600", "1200", "1800", "max"];
const VARIANT_LABEL: Record<string, string> = {
  thumb: "Thumb",
  "600": "600w",
  "1200": "1200w",
  "1800": "1800w",
  max: "Max",
};

const DEV_DID = "did:dev:user";

const DEV_MOCK: LoaderData = {
  currentUserDid: DEV_DID,
  folder: { id: 1, user_did: DEV_DID, name: "my-images", parent_id: null },
  breadcrumbs: [{ id: 1, name: "my-images" }],
  subfolders: [
    { id: 2, user_did: DEV_DID, name: "blog-headers", parent_id: 1, created_at: "2026-01-01T00:00:00.000Z" },
  ],
  images: [
    {
      id: 1,
      user_did: DEV_DID,
      filename: "00000000-0000-0000-0000-000000000001",
      original_name: "hero.jpg",
      width: 1600,
      height: 900,
      sizes: { thumb: { width: 300, height: 169 }, "600": { width: 600, height: 338 }, max: { width: 1600, height: 900 } },
      created_at: "2026-06-01T10:00:00.000Z",
    },
    {
      id: 2,
      user_did: DEV_DID,
      filename: "00000000-0000-0000-0000-000000000002",
      original_name: "portrait.jpg",
      width: 800,
      height: 1200,
      sizes: { thumb: { width: 200, height: 300 }, max: { width: 800, height: 1200 } },
      created_at: "2026-06-02T12:00:00.000Z",
    },
  ],
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Image Library" }];
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) return DEV_MOCK;

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folder");
  const apiUrl = `http://localhost:3009/api/image-service/browse${folderId ? `?folderId=${folderId}` : ""}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Cookie: request.headers.get("Cookie") ?? "" },
    });
    if (!response.ok) throw new Error(`Image Service returned ${response.status}`);
    const data = await response.json() as Omit<LoaderData, "currentUserDid">;
    return { ...data, currentUserDid: did };
  } catch (err) {
    console.error("[images loader]", err);
    return { folder: null, breadcrumbs: [], subfolders: [], images: [], currentUserDid: did } satisfies LoaderData;
  }
}

function thumbUrl(image: BrowseImage): string {
  const variant = "thumb" in image.sizes ? "thumb"
    : "600" in image.sizes ? "600"
    : "1200" in image.sizes ? "1200"
    : "max";
  return `/image-storage/${image.user_did}/${image.filename}/${variant}.webp`;
}

export default function ImagesRoute({ loaderData }: Route.ComponentProps) {
  const { folder, breadcrumbs, subfolders, images, currentUserDid } = loaderData;
  const isEmpty = subfolders.length === 0 && images.length === 0;
  const isOwnTree = folder?.user_did === currentUserDid;

  const uploadModal = useModal();
  const newFolderModal = useModal();
  const revalidator = useRevalidator();

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [moveImage, setMoveImage] = useState<BrowseImage | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function refresh() { revalidator.revalidate(); }

  function handleCopy(image: BrowseImage, variant: string) {
    const url = `${window.location.origin}/image-storage/${image.user_did}/${image.filename}/${variant}.webp`;
    navigator.clipboard.writeText(url).then(() => {
      const key = `${image.id}:${variant}`;
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(prev => prev === key ? null : prev), 2000);
    }).catch(() => { /* clipboard denied — no visual change */ });
  }

  function handleUploadClose() { uploadModal.close(); refresh(); }

  async function handleDeleteFolder(folderId: number) {
    setDeleteError(null);
    const res = await fetch(`/api/image-service/folders/${folderId}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDeleteId(null);
      refresh();
    } else {
      const data = await res.json() as { error?: string };
      setDeleteError(data.error ?? "Delete failed");
    }
  }

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Tiles}>
          Image Library
        </PageContainerHeading>
      }
      topButtons={
        <div className={styles.topButtons}>
          {isOwnTree && folder && (
            <Button variant="secondary" type="button" onClick={newFolderModal.open}>
              New Folder
            </Button>
          )}
          <Button type="button" onClick={uploadModal.open}>Upload Images</Button>
        </div>
      }
    >
      <UploadModal isOpen={uploadModal.isOpen} onClose={handleUploadClose} />

      {isOwnTree && folder && (
        <NewFolderModal
          isOpen={newFolderModal.isOpen}
          parentFolderId={folder.id}
          onClose={newFolderModal.close}
          onSuccess={refresh}
        />
      )}

      {moveImage && (
        <MoveImageModal
          isOpen={true}
          imageId={moveImage.id}
          imageName={moveImage.original_name}
          currentFolderId={folder?.id ?? null}
          onClose={() => setMoveImage(null)}
          onSuccess={() => { setMoveImage(null); refresh(); }}
        />
      )}

      <PageSection>
        <nav className={styles.breadcrumbs} aria-label="Folder navigation">
          <Link to="/images" className={styles.breadcrumbLink}>Image Library</Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id}>
              <span className={styles.breadcrumbSep}>›</span>
              {i === breadcrumbs.length - 1 ? (
                <span className={styles.breadcrumbCurrent}>{crumb.name}</span>
              ) : (
                <Link to={`/images?folder=${crumb.id}`} className={styles.breadcrumbLink}>
                  {crumb.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
      </PageSection>

      <PageSection>
        {!folder && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>No images yet</p>
            <p className={styles.emptyStateBody}>
              Upload your first image to create your Image Library folder.
            </p>
          </div>
        )}

        {folder && isEmpty && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>This folder is empty</p>
            <p className={styles.emptyStateBody}>
              Upload images or create subfolders to organise your library.
            </p>
          </div>
        )}

        {deleteError && (
          <p className={styles.deleteError}>{deleteError}</p>
        )}

        {(subfolders.length > 0 || images.length > 0) && (
          <ul className={styles.grid}>
            {subfolders.map((subfolder) => (
              <li key={`f-${subfolder.id}`}>
                {confirmDeleteId === subfolder.id ? (
                  <div className={styles.deleteConfirm}>
                    <span>Delete &ldquo;{subfolder.name}&rdquo;?</span>
                    <div className={styles.deleteConfirmActions}>
                      <Button variant="danger" type="button" onClick={() => handleDeleteFolder(subfolder.id)}>Delete</Button>
                      <Button variant="secondary" type="button" onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.folderTileWrap}>
                    <Link to={`/images?folder=${subfolder.id}`} className={styles.folderTile}>
                      <span className={styles.folderIcon}>
                        <SvgIcon name={SvgImageList.Folder} fill="var(--blue)" />
                      </span>
                      <span className={styles.tileName}>{subfolder.name}</span>
                    </Link>
                    {isOwnTree && (
                      <button
                        type="button"
                        className={styles.tileAction}
                        onClick={() => { setConfirmDeleteId(subfolder.id); setDeleteError(null); }}
                        aria-label={`Delete ${subfolder.name}`}
                        title="Delete folder"
                      >
                        <SvgIcon name={SvgImageList.Trash} fill="currentColor" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}

            {images.map((image) => {
              const orderedVariants = VARIANT_ORDER.filter(v => v in image.sizes);
              return (
              <li key={`i-${image.id}`}>
                <div className={styles.imageTileWrap}>
                  <div className={styles.imageTile}>
                    <span className={styles.thumbnailWrap}>
                      <img
                        src={thumbUrl(image)}
                        alt={image.original_name}
                        className={styles.thumbnail}
                        loading="lazy"
                      />
                    </span>
                    <span className={styles.tileName} title={image.original_name}>
                      {image.original_name}
                    </span>
                    <div className={styles.variantButtons}>
                      {orderedVariants.map(v => {
                        const key = `${image.id}:${v}`;
                        const copied = copiedKey === key;
                        return (
                          <button
                            key={v}
                            type="button"
                            className={`${styles.variantButton}${copied ? ` ${styles.variantButtonCopied}` : ""}`}
                            onClick={() => handleCopy(image, v)}
                            title={`Copy ${VARIANT_LABEL[v] ?? v} URL`}
                          >
                            {copied ? "✓" : (VARIANT_LABEL[v] ?? v)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {isOwnTree && (
                    <button
                      type="button"
                      className={styles.tileAction}
                      onClick={() => setMoveImage(image)}
                      aria-label={`Move ${image.original_name}`}
                      title="Move to folder"
                    >
                      <SvgIcon name={SvgImageList.Folder} fill="currentColor" />
                    </button>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </PageSection>
    </PageContainer>
  );
}
