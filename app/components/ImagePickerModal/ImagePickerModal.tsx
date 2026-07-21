import { useState, useEffect, useCallback } from "react";
import { Modal } from "~/components/Modal/Modal";
import { Spinner } from "~/components/Spinner/Spinner";
import { Button } from "~/components/Button/Button";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { browseFolders } from "~/services/imageServiceClient";
import {
  type BrowseImage,
  type BrowseResponse,
  type ImageSource,
  VARIANT_ORDER,
  VARIANT_LABEL,
  thumbUrl,
  variantUrl,
  largestSizeVariant,
} from "./imageBrowserTypes";
import styles from "./ImagePickerModal.module.css";

type VariantKey = "thumb" | "600" | "1200" | "1800" | "max";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onPick: (src: string, altText: string, sources?: ImageSource[]) => void;
  forcedVariant?: VariantKey;
};

export function ImagePickerModal({
  isOpen,
  onClose,
  onPick,
  forcedVariant,
}: Props) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [tileSplitVariants, setTileSplitVariants] = useState<
    Record<number, string>
  >({});

  const fetchFolder = useCallback(async (folderId?: number) => {
    setLoading(true);
    setError(false);
    setOpenDropdownId(null);
    try {
      const result = await browseFolders(folderId);
      setData(result);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setData(null);
      setTileSplitVariants({});
      fetchFolder();
    }
  }, [isOpen, fetchFolder]);

  useEffect(() => {
    if (!openDropdownId) return;
    function handleClick(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-tile-split-dropdown]")) {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openDropdownId]);

  function navigateToFolder(folderId?: number) {
    setTileSplitVariants({});
    fetchFolder(folderId);
  }

  function handlePick(image: BrowseImage, variant: string) {
    // Mirrors every Variant this image actually has (including the one
    // just picked, and thumb) — once srcset carries width descriptors,
    // srcset-aware browsers ignore src as a candidate entirely, so there's
    // no correctness reason to filter anything out here.
    const sources: ImageSource[] = VARIANT_ORDER.filter(
      (v) => v in image.sizes,
    ).map((v) => ({
      url: `${window.location.origin}${variantUrl(image, v)}`,
      width: image.sizes[v].width,
    }));
    onPick(
      `${window.location.origin}${variantUrl(image, variant)}`,
      "",
      sources,
    );
    onClose();
  }

  const breadcrumbs = data?.breadcrumbs ?? [];
  const currentFolderId = data?.folder?.id;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Image Library"
      style={{ maxWidth: "90rem" }}
      bodyStyle={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div className={styles.breadcrumbs}>
        <button
          type="button"
          className={
            breadcrumbs.length === 0
              ? styles.breadcrumbCurrent
              : styles.breadcrumbLink
          }
          onClick={() => navigateToFolder()}
          disabled={breadcrumbs.length === 0}
        >
          Image Library
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className={styles.breadcrumbSegment}>
            <span className={styles.breadcrumbSep}>›</span>
            {i === breadcrumbs.length - 1 ? (
              <span className={styles.breadcrumbCurrent}>{crumb.name}</span>
            ) : (
              <button
                type="button"
                className={styles.breadcrumbLink}
                onClick={() => navigateToFolder(crumb.id)}
              >
                {crumb.name}
              </button>
            )}
          </span>
        ))}
      </div>

      <div className={styles.content}>
        {loading && (
          <div className={styles.centered}>
            <Spinner size="large" />
          </div>
        )}

        {error && !loading && (
          <div className={styles.centered}>
            <p className={styles.errorMsg}>Image Service unavailable.</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => fetchFolder(currentFolderId)}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {data.subfolders.length === 0 && data.images.length === 0 ? (
              <div className={styles.emptyState}>
                <p>This folder is empty.</p>
              </div>
            ) : (
              <ul className={styles.grid}>
                {data.subfolders.map((folder) => (
                  <li key={`f-${folder.id}`}>
                    <button
                      type="button"
                      className={styles.folderTile}
                      onClick={() => navigateToFolder(folder.id)}
                    >
                      <span className={styles.folderIcon}>
                        <SvgIcon
                          name={SvgImageList.Folder}
                          fill="var(--action-primary)"
                        />
                      </span>
                      <span className={styles.tileName} title={folder.name}>
                        {folder.name}
                      </span>
                    </button>
                  </li>
                ))}

                {data.images.map((image) => {
                  const hasThumb = "thumb" in image.sizes;
                  const sizeVariants = VARIANT_ORDER.filter(
                    (v) => v !== "thumb" && v in image.sizes,
                  );
                  const splitVariant =
                    tileSplitVariants[image.id] ??
                    largestSizeVariant(image.sizes);
                  const isDropdownOpen = openDropdownId === image.id;
                  const otherVariants = sizeVariants.filter(
                    (v) => v !== splitVariant,
                  );

                  return (
                    <li key={`i-${image.id}`}>
                      {forcedVariant ? (
                        <button
                          type="button"
                          className={styles.imageTile}
                          onClick={() => handlePick(image, forcedVariant)}
                          title={`Insert ${image.original_name}`}
                        >
                          <span className={styles.thumbnailWrap}>
                            <img
                              src={thumbUrl(image)}
                              alt={image.original_name}
                              className={styles.thumbnail}
                              loading="lazy"
                            />
                          </span>
                          <span
                            className={styles.tileName}
                            title={image.original_name}
                          >
                            {image.original_name}
                          </span>
                        </button>
                      ) : (
                        <div className={styles.imageTile}>
                          <span className={styles.thumbnailWrap}>
                            <img
                              src={thumbUrl(image)}
                              alt={image.original_name}
                              className={styles.thumbnail}
                              loading="lazy"
                            />
                          </span>
                          <span
                            className={styles.tileName}
                            title={image.original_name}
                          >
                            {image.original_name}
                          </span>
                          <div className={styles.variantButtons}>
                            {hasThumb && (
                              <button
                                type="button"
                                className={styles.variantButton}
                                onClick={() => handlePick(image, "thumb")}
                                title="Insert Thumb"
                              >
                                Thumb
                              </button>
                            )}
                            {splitVariant && (
                              <div
                                className={styles.tileSplitButton}
                                data-tile-split-dropdown
                              >
                                <button
                                  type="button"
                                  className={styles.tileSplitButtonMain}
                                  onClick={() =>
                                    handlePick(image, splitVariant)
                                  }
                                  title={`Insert ${VARIANT_LABEL[splitVariant] ?? splitVariant}`}
                                >
                                  {VARIANT_LABEL[splitVariant] ?? splitVariant}
                                </button>
                                {otherVariants.length > 0 && (
                                  <>
                                    <button
                                      type="button"
                                      className={styles.tileSplitButtonChevron}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDropdownId((prev) =>
                                          prev === image.id ? null : image.id,
                                        );
                                      }}
                                      aria-label="Select size variant"
                                    >
                                      ▾
                                    </button>
                                    {isDropdownOpen && (
                                      <div className={styles.tileSplitDropdown}>
                                        {sizeVariants.map((v) => (
                                          <button
                                            key={v}
                                            type="button"
                                            className={`${styles.tileSplitDropdownItem}${v === splitVariant ? ` ${styles.tileSplitDropdownItemActive}` : ""}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setTileSplitVariants((prev) => ({
                                                ...prev,
                                                [image.id]: v,
                                              }));
                                              setOpenDropdownId(null);
                                            }}
                                          >
                                            {VARIANT_LABEL[v] ?? v}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
