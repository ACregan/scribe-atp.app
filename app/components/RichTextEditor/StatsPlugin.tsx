import { useState } from "react";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $getRoot, type EditorState } from "lexical";
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

export function StatsPlugin() {
  const [stats, setStats] = useState({ words: 0, chars: 0 });

  function handleChange(state: EditorState) {
    state.read(() => {
      const text = $getRoot()
        .getAllTextNodes()
        .map((node) => node.getTextContent())
        .join(" ");
      setStats({ words: countWords(text), chars: countChars(text) });
    });
  }

  return (
    <>
      <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
      <div className={styles.bar}>
        {formatNumber(stats.words)} words &middot; {formatNumber(stats.chars)}{" "}
        chars &middot; {readingTime(stats.words)}
      </div>
    </>
  );
}
