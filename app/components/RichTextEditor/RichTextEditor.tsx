import { useEffect, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { registerCodeHighlighting } from "@lexical/code"; // eslint-disable-line @typescript-eslint/no-deprecated
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import {
  $getRoot,
  $insertNodes,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import { ToolbarPlugin } from "./ToolbarPlugin";
import styles from "./RichTextEditor.module.css";

// ── Nodes registered with the editor ─────────────────────────────────────────

const EDITOR_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  AutoLinkNode,
];

// ── Theme ─────────────────────────────────────────────────────────────────────

const theme = {
  text: {
    bold: styles.bold,
    italic: styles.italic,
    underline: styles.underline,
    strikethrough: styles.strikethrough,
    subscript: styles.subscript,
    superscript: styles.superscript,
    code: styles.inlineCode,
    highlight: styles.highlight,
    underlineStrikethrough: styles.underlineStrikethrough,
  },
  heading: {
    h1: styles.h1,
    h2: styles.h2,
    h3: styles.h3,
    h4: styles.h4,
    h5: styles.h5,
    h6: styles.h6,
  },
  quote: styles.blockquote,
  code: styles.codeBlock,
  codeHighlight: {
    atrule: styles.codeAtrule,
    attr: styles.codeAttr,
    boolean: styles.codeBoolean,
    builtin: styles.codeBuiltin,
    cdata: styles.codeCdata,
    char: styles.codeChar,
    class: styles.codeClass,
    "class-name": styles.codeClassName,
    comment: styles.codeComment,
    constant: styles.codeConstant,
    deleted: styles.codeDeleted,
    doctype: styles.codeDoctype,
    entity: styles.codeEntity,
    function: styles.codeFunction,
    important: styles.codeImportant,
    inserted: styles.codeInserted,
    keyword: styles.codeKeyword,
    namespace: styles.codeNamespace,
    number: styles.codeNumber,
    operator: styles.codeOperator,
    prolog: styles.codeProlog,
    property: styles.codeProperty,
    punctuation: styles.codePunctuation,
    regex: styles.codeRegex,
    selector: styles.codeSelector,
    string: styles.codeString,
    symbol: styles.codeSymbol,
    tag: styles.codeTag,
    url: styles.codeUrl,
    variable: styles.codeVariable,
  },
  list: {
    nested: { listitem: styles.nestedListItem },
    ol: styles.ol,
    ul: styles.ul,
    listitem: styles.listItem,
    listitemChecked: styles.listItemChecked,
    listitemUnchecked: styles.listItemUnchecked,
  },
  link: styles.link,
};

// ── Code highlight plugin ─────────────────────────────────────────────────────

function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerCodeHighlighting(editor), [editor]);
  return null;
}

// ── Initial value plugin ──────────────────────────────────────────────────────

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

// ── Hidden field sync ─────────────────────────────────────────────────────────

function HiddenFieldPlugin({
  name,
  onChange,
}: {
  name: string;
  onChange: (html: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  function handleChange(state: EditorState, ed: LexicalEditor) {
    state.read(() => onChange($generateHtmlFromNodes(ed)));
  }

  return <OnChangePlugin onChange={handleChange} />;
}

// ── Public component ──────────────────────────────────────────────────────────

type RichTextEditorProps = {
  name: string;
  label?: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
};

export function RichTextEditor({
  name,
  label,
  defaultValue = "",
  onChange,
}: RichTextEditorProps) {
  const [html, setHtml] = useState(defaultValue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function handleHtmlChange(newHtml: string) {
    setHtml(newHtml);
    onChange?.(newHtml);
  }

  if (!mounted) {
    return (
      <div className={styles.field}>
        {label && <label className={styles.label}>{label}</label>}
        <textarea
          name={name}
          defaultValue={defaultValue}
          className={styles.fallback}
          rows={12}
        />
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
          nodes: EDITOR_NODES,
          onError: (err) => console.error("Lexical error:", err),
        }}
      >
        <div className={styles.editorWrapper}>
          <ToolbarPlugin />
          <div className={styles.editorInner}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable className={styles.contentEditable} />
              }
              placeholder={
                <div className={styles.placeholder}>Start writing…</div>
              }
              ErrorBoundary={({ children }) => <>{children}</>}
            />
          </div>
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <LinkPlugin />
        <CodeHighlightPlugin />
        <InitialValuePlugin html={defaultValue} />
        <HiddenFieldPlugin name={name} onChange={handleHtmlChange} />
      </LexicalComposer>
      <textarea name={name} value={html} onChange={() => {}} hidden readOnly />
    </div>
  );
}
