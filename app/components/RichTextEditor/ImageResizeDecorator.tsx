import { useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { $getNodeByKey, type NodeKey } from "lexical";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { Textarea } from "~/components/Textarea/Textarea";
import type { ImageNode } from "./imageNode";
import styles from "./ImageResizeDecorator.module.css";

const MIN_WIDTH = 80;

// Module-level set so isModalOpen survives decorator remounts.
// useState would reset on remount; this doesn't.
const openModals = new Set<NodeKey>();

type Props = {
  nodeKey: NodeKey;
  src: string;
  altText: string;
  width: number | null;
};

export function ImageResizeDecorator({ nodeKey, src, altText, width }: Props) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const [isHovered, setIsHovered] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const isDragging = dragWidth !== null;

  const [isModalOpen, setIsModalOpen] = useState(() =>
    openModals.has(nodeKey),
  );
  const [modalAltText, setModalAltText] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
    side: "left" | "right";
  } | null>(null);

  // True between mouseup and the Lexical width prop catching up.
  // Prevents the catch-up effect from firing during an active drag
  // where dragWidth happens to equal width at drag start.
  const commitPendingRef = useRef(false);

  // Global mousemove / mouseup during drag
  useEffect(() => {
    if (!isDragging) return;

    function onMouseMove(e: MouseEvent) {
      if (!dragStateRef.current || !containerRef.current) return;
      const { startX, startWidth, side } = dragStateRef.current;
      const delta = side === "right" ? e.clientX - startX : startX - e.clientX;
      setDragWidth(Math.max(MIN_WIDTH, startWidth + delta));
    }

    function onMouseUp() {
      if (dragStateRef.current === null) return;
      const finalWidth = dragWidth;
      dragStateRef.current = null;
      // Don't clear dragWidth here — wait for the Lexical width prop to catch
      // up in the effect below, so there is no intermediate render where both
      // dragWidth and width are stale.
      commitPendingRef.current = true;
      editor.update(() => {
        const node = $getNodeByKey<ImageNode>(nodeKey);
        node?.setWidth(finalWidth);
      });
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, dragWidth, editor, nodeKey]);

  // Once the Lexical node width prop catches up to the last drag value, clear
  // local drag state. This avoids the flash caused by dragWidth going null
  // before the async editor.update() has committed the new width.
  // commitPendingRef guards against firing during an active drag where
  // dragWidth happens to equal width at drag start (e.g. second resize).
  useEffect(() => {
    if (commitPendingRef.current && dragWidth !== null && dragWidth === width) {
      commitPendingRef.current = false;
      setDragWidth(null);
    }
  }, [width, dragWidth]);

  // Click outside to deselect. Does not depend on isSelected so the listener
  // is stable and not re-attached on every Lexical selection change.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) return;
      clearSelection();
      setSelected(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [clearSelection, setSelected]);

  function startDrag(e: React.MouseEvent, side: "left" | "right") {
    e.preventDefault(); // keep text cursor out of drag
    // getBoundingClientRect().width is 0 in jsdom; fall back to stored width
    const currentWidth =
      containerRef.current?.getBoundingClientRect().width || width || 300;
    dragStateRef.current = {
      startX: e.clientX,
      startWidth: currentWidth,
      side,
    };
    setDragWidth(currentWidth);
  }

  function handleImageMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation(); // prevent Lexical's contenteditable mousedown handler from resetting selection
    clearSelection();
    setSelected(true);
  }

  function handleResetWidth(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    editor.update(() => {
      const node = $getNodeByKey<ImageNode>(nodeKey);
      node?.setWidth(null);
    });
  }

  function handleOpenModal() {
    setModalAltText(altText);
    openModals.add(nodeKey);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    openModals.delete(nodeKey);
    setIsModalOpen(false);
  }

  function handleSaveAltText() {
    editor.update(
      () => {
        const node = $getNodeByKey<ImageNode>(nodeKey);
        node?.setAltText(modalAltText);
      },
      { discrete: true },
    );
    handleCloseModal();
  }

  const showHandles = isHovered || isSelected;
  const displayWidth = dragWidth ?? width;
  const imgStyle: React.CSSProperties = displayWidth
    ? {
        width: displayWidth,
        maxWidth: "100%",
        display: "block",
        margin: "0.8rem 0",
      }
    : { maxWidth: "100%", display: "block", margin: "0.8rem 0" };

  return (
    <div
      ref={containerRef}
      className={styles.wrapper}
      style={
        displayWidth ? { width: displayWidth, maxWidth: "100%" } : undefined
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showHandles && (
        <div
          className={styles.handle}
          data-side="left"
          onMouseDown={(e) => startDrag(e, "left")}
        />
      )}

      <img
        src={src}
        alt={altText}
        style={imgStyle}
        draggable={false}
        onMouseDown={handleImageMouseDown}
        onClick={(e) => e.stopPropagation()}
      />

      {showHandles && (
        <div
          className={styles.handle}
          data-side="right"
          onMouseDown={(e) => startDrag(e, "right")}
        />
      )}

      {isDragging && dragWidth !== null && (
        <div className={styles.badge}>{Math.round(dragWidth)}px</div>
      )}

      {showHandles && (
        <button
          type="button"
          className={styles.altTextBtn}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={handleOpenModal}
        >
          Alt text
        </button>
      )}

      {showHandles && width !== null && (
        <button
          type="button"
          className={styles.resetBtn}
          onMouseDown={handleResetWidth}
          title="Remove manual width"
        >
          Reset size
        </button>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Edit alt text"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveAltText}
              disabled={modalAltText === altText}
            >
              Save
            </Button>
          </>
        }
      >
        <Textarea
          id="alt-text-input"
          label="Alt text"
          rows={3}
          placeholder="Describe the image, or leave empty for decorative images"
          value={modalAltText}
          onChange={(e) => setModalAltText(e.target.value)}
        />
      </Modal>
    </div>
  );
}
