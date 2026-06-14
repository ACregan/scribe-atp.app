import { useState, useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import styles from "./StatsPlugin.module.css";

// ── Pure count functions (exported for unit tests) ────────────────────────────

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countChars(text: string): number {
  return text.length;
}

export function readingTime(wordCount: number): string {
  if (wordCount < 250) return "< 1 min read";
  return `${Math.floor(wordCount / 250)} min read`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ── Plugin ────────────────────────────────────────────────────────────────────

type StatsPluginProps = {
  isFullscreen?: boolean;
  chromVisible?: boolean;
  statsPinned?: boolean;
  onToggleStatsPin?: () => void;
};

export function StatsPlugin({
  isFullscreen = false,
  chromVisible = true,
  statsPinned = false,
  onToggleStatsPin = () => {},
}: StatsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [stats, setStats] = useState({ words: 0, chars: 0 });

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      editorState.read(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .map((node) => node.getTextContent())
          .join(" ");
        setStats({ words: countWords(text), chars: countChars(text) });
      });
    });
  }, [editor]);

  const barClass = [
    styles.bar,
    isFullscreen ? styles.barFullscreen : "",
    isFullscreen && !chromVisible && !statsPinned ? styles.barHidden : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={barClass}>
      {isFullscreen && (
        <button
          type="button"
          title={statsPinned ? "Unpin stats" : "Pin stats"}
          className={`${styles.pinBtn}${statsPinned ? ` ${styles.pinBtnActive}` : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onToggleStatsPin();
          }}
        >
          <SvgIcon
            name={statsPinned ? SvgImageList.Pinned : SvgImageList.Pin}
            fill="currentColor"
          />
        </button>
      )}
      <span className={styles.counts}>
        {formatNumber(stats.words)} words &middot; {formatNumber(stats.chars)}{" "}
        chars &middot; {readingTime(stats.words)}
      </span>
    </div>
  );
}
