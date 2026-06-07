import { useRef, useEffect, useCallback, useState } from "react";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import type { BrowseImage } from "./ImagePreviewModal";
import styles from "./FullscreenImageViewer.module.css";

type Props = {
  image: BrowseImage;
  onExit: () => void;
};

export function FullscreenImageViewer({ image, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [viewMode, setViewMode] = useState<"fit" | "actual">("fit");

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

  const handleImageClick = useCallback(() => {
    setViewMode((m) => (m === "fit" ? "actual" : "fit"));
  }, []);

  const imageUrl = `/image-storage/${image.user_did}/${image.filename}/max.webp`;

  return (
    <div ref={containerRef} className={styles.container}>
      <div
        className={
          viewMode === "fit" ? styles.imageWrapFit : styles.imageWrapActual
        }
        onClick={handleImageClick}
      >
        <img
          src={imageUrl}
          alt={image.original_name}
          className={viewMode === "fit" ? styles.imageFit : styles.imageActual}
          draggable={false}
        />
      </div>
    </div>
  );
}
