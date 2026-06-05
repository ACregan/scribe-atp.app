import type { Route } from "./+types/images";
import { Link, useRevalidator } from "react-router";
import { requireAuth, useRealOAuth } from "~/services/auth.server";
import { useModal } from "~/components/Modal/useModal";
import { Button } from "~/components/Button/Button";
import { UploadModal } from "./UploadModal";
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
  folder: BrowseFolder | null;
  breadcrumbs: Array<{ id: number; name: string }>;
  subfolders: BrowseFolder[];
  images: BrowseImage[];
};

const DEV_MOCK: LoaderData = {
  folder: { id: 1, name: "my-images", parent_id: null },
  breadcrumbs: [{ id: 1, name: "my-images" }],
  subfolders: [
    { id: 2, name: "blog-headers", parent_id: 1, created_at: "2026-01-01T00:00:00.000Z" },
  ],
  images: [
    {
      id: 1,
      user_did: "did:dev:user",
      filename: "00000000-0000-0000-0000-000000000001",
      original_name: "hero.jpg",
      width: 1600,
      height: 900,
      sizes: { thumb: { width: 300, height: 169 }, "600": { width: 600, height: 338 }, max: { width: 1600, height: 900 } },
      created_at: "2026-06-01T10:00:00.000Z",
    },
    {
      id: 2,
      user_did: "did:dev:user",
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
  await requireAuth(request);

  if (!useRealOAuth) return DEV_MOCK;

  const url = new URL(request.url);
  const folderId = url.searchParams.get("folder");
  const apiUrl = `http://localhost:3009/api/image-service/browse${folderId ? `?folderId=${folderId}` : ""}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Cookie: request.headers.get("Cookie") ?? "" },
    });
    if (!response.ok) throw new Error(`Image Service returned ${response.status}`);
    return (await response.json()) as LoaderData;
  } catch (err) {
    console.error("[images loader]", err);
    return { folder: null, breadcrumbs: [], subfolders: [], images: [] } satisfies LoaderData;
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
  const { folder, breadcrumbs, subfolders, images } = loaderData;
  const isEmpty = subfolders.length === 0 && images.length === 0;
  const { isOpen, open, close } = useModal();
  const revalidator = useRevalidator();

  function handleModalClose() {
    close();
    revalidator.revalidate();
  }

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Tiles}>
          Image Library
        </PageContainerHeading>
      }
      topButtons={
        <Button type="button" onClick={open}>Upload Images</Button>
      }
    >
      <UploadModal isOpen={isOpen} onClose={handleModalClose} />
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

        {(subfolders.length > 0 || images.length > 0) && (
          <ul className={styles.grid}>
            {subfolders.map((subfolder) => (
              <li key={`f-${subfolder.id}`}>
                <Link to={`/images?folder=${subfolder.id}`} className={styles.folderTile}>
                  <span className={styles.folderIcon}>
                    <SvgIcon name={SvgImageList.Folder} fill="var(--blue)" />
                  </span>
                  <span className={styles.tileName}>{subfolder.name}</span>
                </Link>
              </li>
            ))}

            {images.map((image) => (
              <li key={`i-${image.id}`}>
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PageContainer>
  );
}
