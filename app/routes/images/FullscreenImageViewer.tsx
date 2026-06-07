import { useRef, useEffect, useCallback, useState } from "react";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import type { BrowseImage } from "./ImagePreviewModal";
import styles from "./FullscreenImageViewer.module.css";

type Props = {
  image: BrowseImage;
  images: BrowseImage[];
  breadcrumbs: Array<{ id: number; name: string }>;
  onExit: () => void;
};

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function FullscreenImageViewer({
  image,
  images,
  breadcrumbs,
  onExit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(
      0,
      images.findIndex((img) => img.id === image.id),
    ),
  );
  const [viewMode, setViewMode] = useState<"fit" | "actual">("fit");
  const [infoPaneOpen, setInfoPaneOpen] = useState(false);
  const [chevronVisible, setChevronVisible] = useState(false);

  const currentImage = images[currentIndex] ?? image;
  const imageUrl = `/image-storage/${currentImage.user_did}/${currentImage.filename}/max.webp`;
  const maxData =
    currentImage.sizes["max"] ?? Object.values(currentImage.sizes)[0];
  const folderPath =
    breadcrumbs.length > 0
      ? breadcrumbs.map((b) => b.name).join(" › ")
      : "Image Library";

  // Fullscreen lifecycle
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.requestFullscreen().catch(() => onExitRef.current());

    function handleFullscreenChange() {
      if (!document.fullscreenElement) onExitRef.current();
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Chevron auto-hide on pointer:fine devices
  const hideTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    function handleMouseMove() {
      setChevronVisible(true);
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(
        () => setChevronVisible(false),
        3000,
      );
    }

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleImageClick = useCallback(() => {
    setViewMode((m) => (m === "fit" ? "actual" : "fit"));
  }, []);

  function goPrev() {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
    setViewMode("fit");
  }

  function goNext() {
    setCurrentIndex((i) => (i + 1) % images.length);
    setViewMode("fit");
  }

  function handleClose() {
    document.exitFullscreen().catch(() => {});
  }

  return (
    <div ref={containerRef} className={styles.container}>
      {/* Image area */}
      <div
        className={
          viewMode === "fit" ? styles.imageWrapFit : styles.imageWrapActual
        }
        onClick={handleImageClick}
      >
        <img
          key={`${currentImage.id}`}
          src={imageUrl}
          alt={currentImage.original_name}
          className={viewMode === "fit" ? styles.imageFit : styles.imageActual}
          draggable={false}
        />
      </div>

      {/* Info pane */}
      <div
        className={`${styles.infoPane} ${infoPaneOpen ? "" : styles.infoPaneHidden}`}
      >
        <dl className={styles.meta}>
          <div className={styles.metaRow}>
            <dt>Filename</dt>
            <dd>{currentImage.original_name}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Dimensions</dt>
            <dd>
              {maxData?.width !== undefined && maxData?.height !== undefined
                ? `${maxData.width} × ${maxData.height} px`
                : "—"}
            </dd>
          </div>
          <div className={styles.metaRow}>
            <dt>File size</dt>
            <dd>{formatBytes(maxData?.bytes)}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Uploaded</dt>
            <dd>{new Date(currentImage.created_at).toLocaleDateString()}</dd>
          </div>
          <div className={styles.metaRow}>
            <dt>Folder</dt>
            <dd>{folderPath}</dd>
          </div>
        </dl>

        <div className={styles.infoPaneActions}>
          {images.length > 1 && (
            <>
              <button
                type="button"
                className={styles.actionButton}
                onClick={goPrev}
              >
                ‹ Prev
              </button>
              <span className={styles.navCounter}>
                {currentIndex + 1} / {images.length}
              </span>
              <button
                type="button"
                className={styles.actionButton}
                onClick={goNext}
              >
                Next ›
              </button>
            </>
          )}
          <button
            type="button"
            className={`${styles.actionButton} ${styles.closeButton}`}
            onClick={handleClose}
            aria-label="Exit fullscreen"
          >
            <SvgIcon name={SvgImageList.FullscreenClose} fill="currentColor" />
            Close
          </button>
        </div>
      </div>

      {/* Chevron toggle */}
      <button
        type="button"
        className={`${styles.chevronButton} ${chevronVisible ? styles.chevronVisible : ""}`}
        onClick={() => setInfoPaneOpen((o) => !o)}
        aria-label={infoPaneOpen ? "Hide info" : "Show info"}
      >
        <SvgIcon
          name={
            infoPaneOpen ? SvgImageList.ChevronDown : SvgImageList.ChevronUp
          }
          fill="currentColor"
        />
      </button>
    </div>
  );
}
