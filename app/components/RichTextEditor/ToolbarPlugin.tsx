import { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_ELEMENT_COMMAND,
  KEY_DOWN_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type ElementFormatType,
  type ElementNode,
  type RangeSelection,
  type TextFormatType,
} from "lexical";
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  mergeRegister,
} from "@lexical/utils";
import {
  $getSelectionStyleValueForProperty,
  $isAtNodeEnd,
  $patchStyleText,
} from "@lexical/selection";
import { INSERT_IMAGE_COMMAND } from "./imageNode";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { ImagePickerModal } from "~/components/ImagePickerModal/ImagePickerModal";
import styles from "./RichTextEditor.module.css";

// ─── Web Speech API types (not in default TS lib) ─────────────────────────────

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

// ─── $setBlocksType — not in @lexical/utils 0.44, implemented locally ─────────

function $setBlocksType(
  selection: RangeSelection,
  createElement: () => ElementNode,
) {
  const seen = new Set<string>();
  const nodes = selection.getNodes();

  // Collect unique top-level block elements touched by the selection
  for (const node of nodes) {
    const topLevel = node.getTopLevelElement();
    if (topLevel === null || seen.has(topLevel.getKey())) continue;
    seen.add(topLevel.getKey());

    // Skip decorator nodes and list nodes
    if (!$isElementNode(topLevel) || $isListNode(topLevel)) continue;

    const newEl = createElement();
    // Move children from the old block into the new one
    for (const child of topLevel.getChildren()) {
      newEl.append(child);
    }
    topLevel.replace(newEl);
    newEl.select();
  }

  // If nothing was captured (e.g. collapsed cursor) act on the anchor node
  if (seen.size === 0) {
    const anchor = selection.anchor.getNode();
    const topLevel = $isElementNode(anchor)
      ? anchor
      : anchor.getTopLevelElement();
    if (
      topLevel !== null &&
      $isElementNode(topLevel) &&
      !$isListNode(topLevel)
    ) {
      const newEl = createElement();
      for (const child of topLevel.getChildren()) {
        newEl.append(child);
      }
      topLevel.replace(newEl);
      newEl.select();
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bullet"
  | "number"
  | "check"
  | "quote"
  | "code";

const BLOCK_LABELS: Record<BlockType, string> = {
  paragraph: "Normal",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  bullet: "Bullet List",
  number: "Numbered List",
  check: "Check List",
  quote: "Quote",
  code: "Code Block",
};

const FONT_FAMILIES = [
  "Arial",
  "Courier New",
  "Georgia",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

const DEFAULT_FONT_SIZE = "15px";

function parsePx(v: string): number {
  return parseInt(v, 10) || 15;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSelectedNode(sel: ReturnType<typeof $getSelection>) {
  if (!$isRangeSelection(sel)) return null;
  const anchor = sel.anchor;
  const focus = sel.focus;
  const aNode = anchor.getNode();
  const fNode = focus.getNode();
  if (aNode === fNode) return aNode;
  return sel.isBackward()
    ? $isAtNodeEnd(focus)
      ? aNode
      : fNode
    : $isAtNodeEnd(anchor)
      ? aNode
      : fNode;
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function Dropdown({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={styles.dropdownTrigger}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {label} <span className={styles.dropdownArrow}>▾</span>
      </button>
      {open && (
        <div className={styles.dropdownMenu} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  label,
  active,
  shortcut,
  onClick,
}: {
  label: string;
  active?: boolean;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.dropdownItem}${active ? ` ${styles.dropdownItemActive}` : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      <span>{label}</span>
      {shortcut && <span className={styles.dropdownShortcut}>{shortcut}</span>}
    </button>
  );
}

// ─── ToolbarPlugin ────────────────────────────────────────────────────────────

type ToolbarPluginProps = {
  isFullscreen?: boolean;
  chromVisible?: boolean;
  onToggleFullscreen?: () => void;
  toolbarPinned?: boolean;
  onToggleToolbarPin?: () => void;
};

export function ToolbarPlugin({
  isFullscreen = false,
  chromVisible = true,
  onToggleFullscreen = () => {},
  toolbarPinned = false,
  onToggleToolbarPin = () => {},
}: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();

  // History
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Block type
  const [blockType, setBlockType] = useState<BlockType>("paragraph");

  // Text formats
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isHighlight, setIsHighlight] = useState(false);
  const [isLink, setIsLink] = useState(false);

  // Inline styles
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [fontColor, setFontColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");

  // Link editing
  const [isLinkEditing, setIsLinkEditing] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // Image picker
  const {
    isOpen: isImagePickerOpen,
    open: openImagePicker,
    close: closeImagePicker,
  } = useModal();

  // Speech
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Shortcuts modal
  const {
    isOpen: isShortcutsOpen,
    open: openShortcuts,
    close: closeShortcuts,
  } = useModal();

  // ── Sync toolbar state with selection ────────────────────────────────────

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    setIsBold(selection.hasFormat("bold"));
    setIsItalic(selection.hasFormat("italic"));
    setIsUnderline(selection.hasFormat("underline"));
    setIsStrikethrough(selection.hasFormat("strikethrough"));
    setIsSubscript(selection.hasFormat("subscript"));
    setIsSuperscript(selection.hasFormat("superscript"));
    setIsCode(selection.hasFormat("code"));
    setIsHighlight(selection.hasFormat("highlight"));

    const rawFont = $getSelectionStyleValueForProperty(
      selection,
      "font-family",
      "Arial",
    );
    setFontFamily(rawFont || "Arial");

    const rawSize = $getSelectionStyleValueForProperty(
      selection,
      "font-size",
      DEFAULT_FONT_SIZE,
    );
    setFontSize(rawSize || DEFAULT_FONT_SIZE);

    const rawColor = $getSelectionStyleValueForProperty(
      selection,
      "color",
      "#000000",
    );
    setFontColor(rawColor.startsWith("#") ? rawColor : "#000000");

    const rawBg = $getSelectionStyleValueForProperty(
      selection,
      "background-color",
      "#ffffff",
    );
    setBgColor(rawBg.startsWith("#") ? rawBg : "#ffffff");

    const node = getSelectedNode(selection);
    const parent = node?.getParent();
    setIsLink($isLinkNode(parent) || $isLinkNode(node));

    const anchor = selection.anchor.getNode();
    let el =
      anchor.getKey() === "root"
        ? anchor
        : $findMatchingParent(anchor, (e) => {
            const p = e.getParent();
            return p !== null && $isRootOrShadowRoot(p);
          });
    if (!el) el = anchor.getTopLevelElementOrThrow();

    if ($isListNode(el)) {
      const parentList = $getNearestNodeOfType<ListNode>(anchor, ListNode);
      setBlockType((parentList ?? el).getListType() as BlockType);
    } else if ($isHeadingNode(el)) {
      setBlockType(el.getTag() as BlockType);
    } else if ($isCodeNode(el)) {
      setBlockType("code");
    } else {
      const t = el.getType() as BlockType;
      setBlockType(BLOCK_LABELS[t] ? t : "paragraph");
    }
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(updateToolbar);
      }),
    );
  }, [editor, updateToolbar]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function applyStyle(patch: Record<string, string | null>) {
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) $patchStyleText(sel, patch);
    });
  }

  function setBlockTypeTo(type: BlockType) {
    if (type === "bullet") {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else if (type === "number") {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else if (type === "check") {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    } else {
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        switch (type) {
          case "paragraph":
            $setBlocksType(sel, () => $createParagraphNode());
            break;
          case "quote":
            $setBlocksType(sel, () => $createQuoteNode());
            break;
          case "code":
            $setBlocksType(sel, () => $createCodeNode());
            break;
          default:
            $setBlocksType(sel, () =>
              $createHeadingNode(type as HeadingTagType),
            );
        }
      });
    }
  }

  function changeFontSize(delta: number) {
    const next = Math.max(8, Math.min(96, parsePx(fontSize) + delta));
    applyStyle({ "font-size": `${next}px` });
  }

  function clearFormatting() {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      $patchStyleText(sel, {
        color: null,
        "background-color": null,
        "font-family": null,
        "font-size": null,
      });
      const formats: TextFormatType[] = [
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "code",
        "subscript",
        "superscript",
        "highlight",
      ];
      for (const node of sel.getNodes()) {
        if ($isTextNode(node)) {
          for (const f of formats) {
            if (node.hasFormat(f)) node.toggleFormat(f);
          }
          node.setStyle("");
        }
      }
    });
  }

  function transformCase(fn: (s: string) => string) {
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) sel.insertText(fn(sel.getTextContent()));
    });
  }

  function insertLink() {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      setLinkUrl("");
      setIsLinkEditing(true);
    }
  }

  function confirmLink() {
    const url = linkUrl.trim();
    if (url) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
        url,
        target: "_blank",
        rel: "noopener noreferrer",
      });
    }
    setIsLinkEditing(false);
  }

  // ── Speech to text ────────────────────────────────────────────────────────

  function toggleSpeech() {
    type SpeechWindow = Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SR: SpeechRecognitionConstructor | undefined =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;

    if (!SR) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isSpeechActive) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[e.results.length - 1][0].transcript;
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) sel.insertText(transcript);
      });
    };
    rec.onend = () => setIsSpeechActive(false);
    rec.onerror = () => setIsSpeechActive(false);
    rec.start();
    recognitionRef.current = rec;
    setIsSpeechActive(true);
  }

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Registered in a separate effect so insertLink() always closes over the
  // current isLink value without needing it in the main mergeRegister deps.
  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const ctrl = event.ctrlKey || event.metaKey;
        if (!ctrl) return false;

        // CTRL+Shift+1–9 — block type
        // Uses event.code (physical key position) so the shortcut works on all
        // keyboard layouts regardless of what Shift+digit produces (e.g. "!").
        // CTRL+ALT was avoided: on Windows, Ctrl+Alt == AltGr, which produces
        // composed characters via beforeinput that keydown preventDefault cannot
        // suppress. CTRL+Shift+0 was removed: on Windows it is reserved by the
        // OS input method manager regardless of keyboard layout configuration.
        if (event.shiftKey && !event.altKey) {
          const digitMatch = event.code.match(/^Digit([1-9])$/);
          if (digitMatch) {
            event.preventDefault();
            switch (digitMatch[1]) {
              case "1":
                setBlockTypeTo("h1");
                break;
              case "2":
                setBlockTypeTo("h2");
                break;
              case "3":
                setBlockTypeTo("h3");
                break;
              case "4":
                setBlockTypeTo("h4");
                break;
              case "5":
                setBlockTypeTo("h5");
                break;
              case "6":
                setBlockTypeTo("h6");
                break;
              case "7":
                setBlockTypeTo("number");
                break;
              case "8":
                setBlockTypeTo("bullet");
                break;
              case "9":
                setBlockTypeTo("quote");
                break;
            }
            return true;
          }
        }

        // CTRL+Shift+` — normal paragraph
        // Backtick key is used because Ctrl+Shift+0 is intercepted by the
        // Windows OS input method manager on systems with multiple keyboard
        // layouts. event.code is layout-independent.
        if (event.shiftKey && !event.altKey && event.code === "Backquote") {
          event.preventDefault();
          setBlockTypeTo("paragraph");
          return true;
        }

        // CTRL+Shift+S — strikethrough
        if (event.shiftKey && !event.altKey && event.key === "S") {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
          return true;
        }

        // CTRL+Shift+F — toggle distraction-free fullscreen
        if (event.shiftKey && !event.altKey && event.key === "F") {
          event.preventDefault();
          onToggleFullscreen();
          return true;
        }

        if (!event.shiftKey && !event.altKey) {
          switch (event.key) {
            // CTRL+` — inline code
            case "`":
              event.preventDefault();
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
              return true;
            // CTRL+\ — clear formatting
            case "\\":
              event.preventDefault();
              clearFormatting();
              return true;
            // CTRL+K — insert / edit link (link input has autoFocus)
            case "k":
              event.preventDefault();
              insertLink();
              return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [editor, isLink, onToggleFullscreen]); // isLink needed so insertLink() sees current link state

  // ── Render ─────────────────────────────────────────────────────────────────

  function btn(active?: boolean) {
    return `${styles.toolbarBtn}${active ? ` ${styles.toolbarBtnActive}` : ""}`;
  }

  const toolbarClass = [
    styles.toolbar,
    isFullscreen ? styles.toolbarFullscreen : "",
    isFullscreen && !chromVisible && !toolbarPinned ? styles.toolbarHidden : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={toolbarClass}>
        {/* History */}
        <button
          type="button"
          title="Undo"
          disabled={!canUndo}
          className={btn()}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(UNDO_COMMAND, undefined);
          }}
        >
          ↩
        </button>
        <button
          type="button"
          title="Redo"
          disabled={!canRedo}
          className={btn()}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(REDO_COMMAND, undefined);
          }}
        >
          ↪
        </button>

        <span className={styles.divider} />

        {/* Block type */}
        <Dropdown label={BLOCK_LABELS[blockType] ?? "Normal"}>
          <DropdownItem
            label="Normal"
            shortcut="Ctrl+Shift+`"
            active={blockType === "paragraph"}
            onClick={() => setBlockTypeTo("paragraph")}
          />
          {(["h1", "h2", "h3", "h4", "h5", "h6"] as HeadingTagType[]).map(
            (tag, i) => (
              <DropdownItem
                key={tag}
                label={BLOCK_LABELS[tag as BlockType]}
                shortcut={`Ctrl+Shift+${i + 1}`}
                active={blockType === tag}
                onClick={() => setBlockTypeTo(tag as BlockType)}
              />
            ),
          )}
          <DropdownItem
            label="Bullet List"
            shortcut="Ctrl+Shift+8"
            active={blockType === "bullet"}
            onClick={() => setBlockTypeTo("bullet")}
          />
          <DropdownItem
            label="Numbered List"
            shortcut="Ctrl+Shift+7"
            active={blockType === "number"}
            onClick={() => setBlockTypeTo("number")}
          />
          <DropdownItem
            label="Check List"
            active={blockType === "check"}
            onClick={() => setBlockTypeTo("check")}
          />
          <DropdownItem
            label="Quote"
            shortcut="Ctrl+Shift+9"
            active={blockType === "quote"}
            onClick={() => setBlockTypeTo("quote")}
          />
          <DropdownItem
            label="Code Block"
            active={blockType === "code"}
            onClick={() => setBlockTypeTo("code")}
          />
        </Dropdown>

        <span className={styles.divider} />

        {/* Font family */}
        <select
          className={styles.toolbarSelect}
          value={fontFamily}
          title="Font family"
          onChange={(e) => applyStyle({ "font-family": e.target.value })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        {/* Font size */}
        <input
          type="number"
          className={styles.fontSizeInput}
          value={parsePx(fontSize)}
          min={8}
          max={96}
          title="Font size"
          onChange={(e) => applyStyle({ "font-size": `${e.target.value}px` })}
        />
        <button
          type="button"
          title="Decrease font size"
          className={btn()}
          onMouseDown={(e) => {
            e.preventDefault();
            changeFontSize(-1);
          }}
        >
          −
        </button>
        <button
          type="button"
          title="Increase font size"
          className={btn()}
          onMouseDown={(e) => {
            e.preventDefault();
            changeFontSize(+1);
          }}
        >
          +
        </button>

        <span className={styles.divider} />

        {/* Bold / Italic / Underline */}
        <button
          type="button"
          title="Bold (Ctrl+B)"
          className={btn(isBold)}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
          }}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          title="Italic (Ctrl+I)"
          className={btn(isItalic)}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
          }}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          title="Underline (Ctrl+U)"
          className={btn(isUnderline)}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
          }}
        >
          <u>U</u>
        </button>

        <span className={styles.divider} />

        {/* Inline code + link */}
        <button
          type="button"
          title="Inline code (Ctrl+`)"
          className={btn(isCode)}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
          }}
        >
          {"</>"}
        </button>
        <button
          type="button"
          title={isLink ? "Remove link (Ctrl+K)" : "Insert link (Ctrl+K)"}
          className={btn(isLink)}
          onMouseDown={(e) => {
            e.preventDefault();
            insertLink();
          }}
        >
          🔗
        </button>
        {isLinkEditing && (
          <>
            <input
              type="url"
              className={styles.linkInput}
              value={linkUrl}
              placeholder="https://…"
              autoFocus
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmLink();
                if (e.key === "Escape") setIsLinkEditing(false);
              }}
            />
            <button
              type="button"
              className={btn()}
              onMouseDown={(e) => {
                e.preventDefault();
                confirmLink();
              }}
            >
              ✓
            </button>
            <button
              type="button"
              className={btn()}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsLinkEditing(false);
              }}
            >
              ✕
            </button>
          </>
        )}
        <button
          type="button"
          title="Insert image"
          className={btn(isImagePickerOpen)}
          onMouseDown={(e) => {
            e.preventDefault();
            openImagePicker();
          }}
        >
          <SvgIcon name={SvgImageList.Image} fill="currentColor" />
        </button>

        <span className={styles.divider} />

        {/* Text colour */}
        <label className={styles.colorLabel} title="Text colour">
          <span
            className={styles.colorSwatch}
            style={{ borderBottom: `3px solid ${fontColor}` }}
          >
            A
          </span>
          <input
            type="color"
            className={styles.colorInput}
            value={fontColor}
            onChange={(e) => applyStyle({ color: e.target.value })}
          />
        </label>

        {/* Background colour */}
        <label className={styles.colorLabel} title="Background colour">
          <span
            className={styles.colorSwatch}
            style={{ backgroundColor: bgColor }}
          >
            A
          </span>
          <input
            type="color"
            className={styles.colorInput}
            value={bgColor}
            onChange={(e) => applyStyle({ "background-color": e.target.value })}
          />
        </label>

        <span className={styles.divider} />

        {/* Format dropdown */}
        <Dropdown label="Format">
          <DropdownItem
            label="Strikethrough"
            shortcut="Ctrl+Shift+S"
            active={isStrikethrough}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
            }
          />
          <DropdownItem
            label="Subscript"
            active={isSubscript}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript")
            }
          />
          <DropdownItem
            label="Superscript"
            active={isSuperscript}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript")
            }
          />
          <DropdownItem
            label="Highlight"
            active={isHighlight}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "highlight")
            }
          />
          <DropdownItem
            label="Lowercase"
            onClick={() => transformCase((s) => s.toLowerCase())}
          />
          <DropdownItem
            label="Uppercase"
            onClick={() => transformCase((s) => s.toUpperCase())}
          />
          <DropdownItem
            label="Capitalise"
            onClick={() =>
              transformCase((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()))
            }
          />
          <DropdownItem
            label="Clear formatting"
            shortcut="Ctrl+\"
            onClick={clearFormatting}
          />
        </Dropdown>

        <span className={styles.divider} />

        {/* Alignment dropdown */}
        <Dropdown label="Align">
          {(
            [
              "left",
              "center",
              "right",
              "justify",
              "start",
              "end",
            ] as ElementFormatType[]
          ).map((a) => (
            <DropdownItem
              key={a}
              label={a.charAt(0).toUpperCase() + a.slice(1)}
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, a)}
            />
          ))}
          <DropdownItem
            label="Outdent"
            onClick={() =>
              editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)
            }
          />
          <DropdownItem
            label="Indent"
            onClick={() =>
              editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)
            }
          />
        </Dropdown>

        {/* Speech + shortcuts reference — pushed to the right */}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          title={isSpeechActive ? "Stop dictation" : "Start dictation"}
          className={`${btn()} ${isSpeechActive ? styles.speechActive : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            toggleSpeech();
          }}
        >
          🎤{isSpeechActive ? " Stop" : ""}
        </button>
        <button
          type="button"
          title="Keyboard shortcuts"
          className={btn()}
          onMouseDown={(e) => {
            e.preventDefault();
            openShortcuts();
          }}
        >
          ?
        </button>

        <span className={styles.divider} />

        {isFullscreen && (
          <button
            type="button"
            title={toolbarPinned ? "Unpin toolbar" : "Pin toolbar"}
            className={btn(toolbarPinned)}
            onMouseDown={(e) => {
              e.preventDefault();
              onToggleToolbarPin();
            }}
          >
            <SvgIcon
              name={toolbarPinned ? SvgImageList.Pinned : SvgImageList.Pin}
              fill="currentColor"
            />
          </button>
        )}

        <button
          type="button"
          title={isFullscreen ? "Exit fullscreen (Ctrl+Shift+F)" : "Fullscreen (Ctrl+Shift+F)"}
          className={btn()}
          onMouseDown={(e) => {
            e.preventDefault();
            onToggleFullscreen();
          }}
        >
          <SvgIcon
            name={isFullscreen ? SvgImageList.FullscreenClose : SvgImageList.FullscreenOpen}
            fill="currentColor"
          />
        </button>
      </div>

      <Modal
        isOpen={isShortcutsOpen}
        onClose={closeShortcuts}
        title="Keyboard shortcuts"
      >
        <table className={styles.shortcutsTable}>
          <tbody>
            <tr>
              <th colSpan={2}>Block type</th>
            </tr>
            <tr>
              <td>Normal</td>
              <td>
                <kbd>Ctrl+Shift+`</kbd>
              </td>
            </tr>
            <tr>
              <td>Heading 1–6</td>
              <td>
                <kbd>Ctrl+Shift+1–6</kbd>
              </td>
            </tr>
            <tr>
              <td>Numbered list</td>
              <td>
                <kbd>Ctrl+Shift+7</kbd>
              </td>
            </tr>
            <tr>
              <td>Bullet list</td>
              <td>
                <kbd>Ctrl+Shift+8</kbd>
              </td>
            </tr>
            <tr>
              <td>Blockquote</td>
              <td>
                <kbd>Ctrl+Shift+9</kbd>
              </td>
            </tr>
            <tr>
              <th colSpan={2}>Inline format</th>
            </tr>
            <tr>
              <td>Bold</td>
              <td>
                <kbd>Ctrl+B</kbd>
              </td>
            </tr>
            <tr>
              <td>Italic</td>
              <td>
                <kbd>Ctrl+I</kbd>
              </td>
            </tr>
            <tr>
              <td>Underline</td>
              <td>
                <kbd>Ctrl+U</kbd>
              </td>
            </tr>
            <tr>
              <td>Strikethrough</td>
              <td>
                <kbd>Ctrl+Shift+S</kbd>
              </td>
            </tr>
            <tr>
              <td>Inline code</td>
              <td>
                <kbd>Ctrl+`</kbd>
              </td>
            </tr>
            <tr>
              <th colSpan={2}>Other</th>
            </tr>
            <tr>
              <td>Insert / edit link</td>
              <td>
                <kbd>Ctrl+K</kbd>
              </td>
            </tr>
            <tr>
              <td>Clear formatting</td>
              <td>
                <kbd>Ctrl+\</kbd>
              </td>
            </tr>
            <tr>
              <td>Fullscreen</td>
              <td>
                <kbd>Ctrl+Shift+F</kbd>
              </td>
            </tr>
            <tr>
              <td>Undo</td>
              <td>
                <kbd>Ctrl+Z</kbd>
              </td>
            </tr>
            <tr>
              <td>Redo</td>
              <td>
                <kbd>Ctrl+Y</kbd>
              </td>
            </tr>
          </tbody>
        </table>
        <p className={styles.shortcutsNote}>
          On Windows with multiple keyboard layouts installed, some
          Ctrl+Shift+number shortcuts may be intercepted by the OS language
          switcher. Remove unused layouts in Windows language settings to
          restore them.
        </p>
      </Modal>
      <ImagePickerModal
        isOpen={isImagePickerOpen}
        onClose={closeImagePicker}
        onPick={(src, altText) => {
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src, altText });
        }}
      />
    </>
  );
}
