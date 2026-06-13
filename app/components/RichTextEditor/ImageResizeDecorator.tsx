import { useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { $getNodeByKey, type NodeKey } from "lexical";
import type { ImageNode } from "./imageNode";
import styles from "./ImageResizeDecorator.module.css";

const MIN_WIDTH = 80;

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

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
    side: "left" | "right";
  } | null>(null);

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
      setDragWidth(null);
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

  // Click outside to deselect
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!isSelected) return;
      if (!containerRef.current?.contains(e.target as Node)) {
        clearSelection();
        setSelected(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isSelected, setSelected, clearSelection]);

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
    clearSelection();
    setSelected(true);
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
    </div>
  );
}
