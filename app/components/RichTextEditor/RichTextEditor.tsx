import { useEffect, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import {
  $getRoot,
  $insertNodes,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import styles from "./RichTextEditor.module.css";

// ── Toolbar ────────────────────────────────────────────────────────────────────

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        title="Bold"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        }}
      >
        <b>B</b>
      </button>
      <button
        type="button"
        title="Italic"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        }}
      >
        <i>I</i>
      </button>
      <button
        type="button"
        title="Underline"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
        }}
      >
        <u>U</u>
      </button>
      <span className={styles.divider} />
      <button
        type="button"
        title="Left align"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left");
        }}
      >
        &#8676;
      </button>
      <button
        type="button"
        title="Centre align"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center");
        }}
      >
        &#8596;
      </button>
      <button
        type="button"
        title="Right align"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right");
        }}
      >
        &#8677;
      </button>
    </div>
  );
}

// ── Initial value plugin ───────────────────────────────────────────────────────

function InitialValuePlugin({ html }: { html: string }) {
  const [editor] = useLexicalComposerContext();
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current || !html) return;
    didInit.current = true;

    editor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(html, "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);
      $getRoot().clear();
      $getRoot().select();
      $insertNodes(nodes);
    });
  }, [editor, html]);

  return null;
}

// ── Hidden textarea sync plugin ────────────────────────────────────────────────

function HiddenFieldPlugin({
  name,
  onChange,
}: {
  name: string;
  onChange: (html: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  function handleChange(state: EditorState, ed: LexicalEditor) {
    state.read(() => {
      onChange($generateHtmlFromNodes(ed));
    });
  }

  return <OnChangePlugin onChange={handleChange} />;
}

// ── Public component ───────────────────────────────────────────────────────────

type RichTextEditorProps = {
  name: string;
  label?: string;
  defaultValue?: string;
};

const theme = {
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
  },
};

const nodes = [HeadingNode, QuoteNode, ListNode, ListItemNode];

export function RichTextEditor({ name, label, defaultValue = "" }: RichTextEditorProps) {
  const [html, setHtml] = useState(defaultValue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // SSR / pre-hydration: render a plain textarea so the form still works
  if (!mounted) {
    return (
      <div className={styles.field}>
        {label && <label className={styles.label}>{label}</label>}
        <textarea name={name} defaultValue={defaultValue} className={styles.fallback} rows={12} />
      </div>
    );
  }

  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      <LexicalComposer
        initialConfig={{
          namespace: name,
          theme,
          nodes,
          onError: (err) => console.error("Lexical error:", err),
        }}
      >
        <div className={styles.editorWrapper}>
          <Toolbar />
          <div className={styles.editorInner}>
            <RichTextPlugin
              contentEditable={<ContentEditable className={styles.contentEditable} />}
              placeholder={<div className={styles.placeholder}>Start writing…</div>}
              ErrorBoundary={({ children }) => <>{children}</>}
            />
          </div>
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <InitialValuePlugin html={defaultValue} />
        <HiddenFieldPlugin name={name} onChange={setHtml} />
      </LexicalComposer>
      {/* Hidden field carries the HTML content on form submission */}
      <textarea name={name} value={html} onChange={() => {}} hidden readOnly />
    </div>
  );
}
