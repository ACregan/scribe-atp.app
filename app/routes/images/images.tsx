import type { Route } from "./+types/images";
import { Link } from "react-router";
import { requireAuth, useRealOAuth } from "~/services/auth.server";
import { browseImages } from "~/services/imageServiceClient.server";
import { Button } from "~/components/Button/Button";
import { UploadModal } from "./UploadModal";
import { NewFolderModal } from "./NewFolderModal";
import { MoveImageModal } from "./MoveImageModal";
import { DeleteImageModal } from "./DeleteImageModal";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { BulkDeleteModal } from "./BulkDeleteModal";
import { BulkMoveModal } from "./BulkMoveModal";
import { AddToNewFolderModal } from "./AddToNewFolderModal";
import {
  type BrowseFolder,
  type BrowseImage,
} from "~/components/ImagePickerModal/imageBrowserTypes";
import { Spinner } from "~/components/Spinner/Spinner";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { useImageLibrary, type UserProfile } from "./useImageLibrary";
import { ImageGrid } from "./ImageGrid";
import styles from "./images.module.css";

type LoaderData = {
  currentUserDid: string;
  folder: BrowseFolder | null;
  breadcrumbs: Array<{ id: number; name: string }>;
  subfolders: BrowseFolder[];
  images: BrowseImage[];
  profiles: Record<string, UserProfile>;
  serviceError?: boolean;
};

const DEV_DID = "did:dev:user";
const DEV_OTHER_DID = "did:plc:otheruser456789abcdefgh";

const DEV_MOCK: LoaderData = {
  currentUserDid: DEV_DID,
  folder: null,
  breadcrumbs: [],
  subfolders: [
    { id: 1, user_did: DEV_DID, name: DEV_DID, parent_id: null },
    { id: 2, user_did: DEV_OTHER_DID, name: DEV_OTHER_DID, parent_id: null },
  ],
  images: [],
  profiles: {
    [DEV_DID]: { displayName: "Dev User", avatarUrl: null },
    [DEV_OTHER_DID]: { displayName: "Another Writer", avatarUrl: null },
  },
};

// Fixture used when a folder query param is present in dev/E2E mode.
// Provides two images large enough that canToggleActual is true in any
// Playwright viewport so fullscreen fit/actual toggle tests work reliably.
const DEV_MOCK_FOLDER: LoaderData = {
  currentUserDid: DEV_DID,
  folder: { id: 1, user_did: DEV_DID, name: DEV_DID, parent_id: null },
  breadcrumbs: [{ id: 1, name: DEV_DID }],
  subfolders: [],
  images: [
    {
      id: 1,
      user_did: DEV_DID,
      filename: "fixture-image-1",
      original_name: "landscape.jpg",
      width: 3000,
      height: 2000,
      sizes: {
        thumb: { width: 300, height: 200, bytes: 15000 },
        max: { width: 3000, height: 2000, bytes: 850000 },
      },
      created_at: "2025-01-15T10:00:00.000Z",
    },
    {
      id: 2,
      user_did: DEV_DID,
      filename: "fixture-image-2",
      original_name: "portrait.jpg",
      width: 1200,
      height: 1600,
      sizes: {
        thumb: { width: 225, height: 300, bytes: 12000 },
        max: { width: 1200, height: 1600, bytes: 420000 },
      },
      created_at: "2025-01-16T10:00:00.000Z",
    },
  ],
  profiles: {
    [DEV_DID]: { displayName: "Dev User", avatarUrl: null },
  },
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Image Library" }];
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    const url = new URL(request.url);
    return url.searchParams.get("folder") ? DEV_MOCK_FOLDER : DEV_MOCK;
  }

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folder");

  try {
    const data = await browseImages(
      folderId,
      request.headers.get("Cookie") ?? "",
    );

    const profiles: Record<string, UserProfile> = {};
    const didsToResolve = data.folder
      ? [data.folder.user_did]
      : [...new Set(data.subfolders.map((f) => f.user_did))];
    if (didsToResolve.length > 0) {
      try {
        const params = new URLSearchParams();
        didsToResolve.forEach((d) => params.append("actors", d));
        const profileRes = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`,
        );
        if (profileRes.ok) {
          const { profiles: fetched } = (await profileRes.json()) as {
            profiles: Array<{
              did: string;
              displayName?: string;
              avatar?: string;
            }>;
          };
          for (const p of fetched) {
            profiles[p.did] = {
              displayName: p.displayName ?? null,
              avatarUrl: p.avatar ?? null,
            };
          }
        }
      } catch {
        // Profile resolution is best-effort; falls back to DID display
      }
    }

    return { ...data, currentUserDid: did, profiles };
  } catch (err) {
    console.error("[images loader]", err);
    return {
      folder: null,
      breadcrumbs: [],
      subfolders: [],
      images: [],
      currentUserDid: did,
      profiles: {},
      serviceError: true,
    } satisfies LoaderData;
  }
}

export default function ImagesRoute({ loaderData }: Route.ComponentProps) {
  const {
    folder,
    breadcrumbs,
    subfolders,
    images,
    currentUserDid,
    profiles,
    serviceError,
  } = loaderData;

  const lib = useImageLibrary({
    folder,
    subfolders,
    images,
    currentUserDid,
    profiles,
  });

  const normalTopButtons = (
    <div className={styles.topButtons}>
      {lib.isOwnTree && folder && (
        <Button
          variant="secondary"
          type="button"
          onClick={lib.newFolderModal.open}
        >
          New Folder
        </Button>
      )}
      <Button type="button" onClick={lib.uploadModal.open}>
        Upload Images
      </Button>
    </div>
  );

  const selectionToolbar = lib.isOwnTree ? (
    <div className={styles.selectionToolbar}>
      <Button
        variant="secondary"
        type="button"
        onClick={() => lib.setBulkMoveOpen(true)}
      >
        Move to
      </Button>
      <Button
        variant="danger"
        type="button"
        onClick={() => lib.setBulkDeleteOpen(true)}
      >
        Delete
      </Button>
      <Button
        variant="secondary"
        type="button"
        onClick={() => lib.setAddToNewFolderOpen(true)}
      >
        Add to New Folder
      </Button>
      <button
        type="button"
        className={styles.clearSelectionButton}
        onClick={lib.clearSelection}
        aria-label="Clear selection"
      >
        <SvgIcon name={SvgImageList.Close} fill="currentColor" />
        {lib.selected.size} selected
      </button>
    </div>
  ) : null;

  const topButtons =
    lib.isOwnTree && lib.isSelectionMode ? selectionToolbar : normalTopButtons;

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Image}>
          Image Library
        </PageContainerHeading>
      }
      topButtons={topButtons}
      fixed
    >
      <UploadModal
        isOpen={lib.uploadModal.isOpen}
        onClose={lib.handleUploadClose}
      />

      {lib.isOwnTree && folder && (
        <NewFolderModal
          isOpen={lib.newFolderModal.isOpen}
          parentFolderId={folder.id}
          onClose={lib.newFolderModal.close}
          onSuccess={lib.refresh}
        />
      )}

      {lib.moveImage && (
        <MoveImageModal
          isOpen={true}
          imageId={lib.moveImage.id}
          imageName={lib.moveImage.original_name}
          currentFolderId={folder?.id ?? null}
          onClose={() => lib.setMoveImage(null)}
          onSuccess={() => {
            lib.setMoveImage(null);
            lib.refresh();
          }}
        />
      )}

      {lib.deleteImage && (
        <DeleteImageModal
          isOpen={true}
          imageId={lib.deleteImage.id}
          imageName={lib.deleteImage.original_name}
          onClose={() => lib.setDeleteImage(null)}
          onSuccess={() => {
            lib.setDeleteImage(null);
            lib.refresh();
          }}
        />
      )}

      {lib.previewImage && (
        <ImagePreviewModal
          isOpen={true}
          image={lib.previewImage}
          images={images}
          folder={folder}
          breadcrumbs={breadcrumbs}
          currentUserDid={currentUserDid}
          onClose={() => lib.setPreviewImage(null)}
          onDelete={() => {
            lib.setPreviewImage(null);
            lib.refresh();
          }}
          onMove={() => {
            lib.setPreviewImage(null);
            lib.refresh();
          }}
        />
      )}

      {lib.bulkDeleteOpen &&
        (() => {
          const { imageIds, folderIds } = lib.parseSelection(lib.selected);
          return (
            <BulkDeleteModal
              isOpen={true}
              imageIds={imageIds}
              folderIds={folderIds}
              onClose={() => lib.setBulkDeleteOpen(false)}
              onSuccess={lib.handleBulkDeleteSuccess}
            />
          );
        })()}

      {lib.bulkMoveOpen &&
        (() => {
          const { imageIds, folderIds } = lib.parseSelection(lib.selected);
          return (
            <BulkMoveModal
              isOpen={true}
              imageIds={imageIds}
              folderIds={folderIds}
              currentFolderId={folder?.id ?? null}
              onClose={() => lib.setBulkMoveOpen(false)}
              onSuccess={lib.handleBulkMoveSuccess}
            />
          );
        })()}

      {lib.addToNewFolderOpen &&
        folder &&
        (() => {
          const { imageIds, folderIds } = lib.parseSelection(lib.selected);
          return (
            <AddToNewFolderModal
              isOpen={true}
              imageIds={imageIds}
              folderIds={folderIds}
              currentFolderId={folder.id}
              onClose={() => lib.setAddToNewFolderOpen(false)}
              onSuccess={lib.handleAddToNewFolderSuccess}
            />
          );
        })()}

      <PageSection>
        <nav className={styles.breadcrumbs} aria-label="Folder navigation">
          <Link to="/images" className={styles.breadcrumbLink}>
            Image Library
          </Link>
          {breadcrumbs.map((crumb, i) => {
            const label = crumb.name.startsWith("did:")
              ? crumb.name === currentUserDid
                ? "My Images"
                : `${profiles[crumb.name]?.displayName ?? crumb.name} Images`
              : crumb.name;
            return (
              <span key={crumb.id}>
                <span className={styles.breadcrumbSep}>›</span>
                {i === breadcrumbs.length - 1 ? (
                  <span className={styles.breadcrumbCurrent}>{label}</span>
                ) : (
                  <Link
                    to={`/images?folder=${crumb.id}`}
                    className={styles.breadcrumbLink}
                  >
                    {label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </PageSection>

      <PageSection overflow>
        {serviceError && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>
              Image Service unavailable
            </p>
            <p className={styles.emptyStateBody}>
              The Image Service did not respond in time. Make sure it is running
              and try again.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={lib.refresh}
              disabled={lib.revalidator.state !== "idle"}
            >
              {lib.revalidator.state !== "idle" ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}

        {!serviceError && !folder && lib.isEmpty && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>No images yet</p>
            <p className={styles.emptyStateBody}>
              Upload your first image to create your Image Library folder.
            </p>
          </div>
        )}

        {!serviceError && folder && lib.isEmpty && (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateHeading}>This folder is empty</p>
            <p className={styles.emptyStateBody}>
              Upload images or create subfolders to organise your library.
            </p>
          </div>
        )}

        {!serviceError && (subfolders.length > 0 || images.length > 0) && (
          <ImageGrid
            subfolders={subfolders}
            images={images}
            currentUserDid={currentUserDid}
            profiles={profiles}
            isOwnTree={lib.isOwnTree}
            folderLabel={lib.folderLabel}
            selected={lib.selected}
            isSelectionMode={lib.isSelectionMode}
            onTileClick={lib.handleTileClick}
            onGridClick={lib.handleGridClick}
            onToggleItem={lib.toggleItem}
            sensors={lib.sensors}
            activeId={lib.activeId}
            onDragStart={lib.onDragStart}
            onDragEnd={lib.onDragEnd}
            onDragCancel={lib.onDragCancel}
            confirmDeleteId={lib.confirmDeleteId}
            deleteError={lib.deleteError}
            onSetConfirmDeleteId={lib.setConfirmDeleteId}
            onSetDeleteError={lib.setDeleteError}
            onDeleteFolder={lib.handleDeleteFolder}
            copiedKey={lib.copiedKey}
            tileSplitVariants={lib.tileSplitVariants}
            openDropdownId={lib.openDropdownId}
            onCopy={lib.handleCopy}
            onSetTileSplitVariants={lib.setTileSplitVariants}
            onSetOpenDropdownId={lib.setOpenDropdownId}
            onSetMoveImage={lib.setMoveImage}
            onSetDeleteImage={lib.setDeleteImage}
            onSetPreviewImage={lib.setPreviewImage}
          />
        )}
      </PageSection>
    </PageContainer>
  );
}
