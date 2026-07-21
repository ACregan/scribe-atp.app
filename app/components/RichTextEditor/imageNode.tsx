import type { JSX } from "react";
import {
  DecoratorNode,
  createCommand,
  type EditorConfig,
  type LexicalCommand,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import { ImageResizeDecorator } from "./ImageResizeDecorator";
import type { ImageSource } from "~/components/ImagePickerModal/imageBrowserTypes";

export type InsertImagePayload = {
  src: string;
  altText: string;
  sources?: ImageSource[];
};

export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> =
  createCommand("INSERT_IMAGE_COMMAND");

type SerializedImageNode = SerializedLexicalNode & {
  src: string;
  altText: string;
  width?: number | null;
  sources?: ImageSource[] | null;
};

// Generic fallback for sites whose article-column width isn't known to the
// editor (each consumer site has its own, mostly fluid, layout) — refined
// per-image to an exact pixel value in exportDOM when the author has
// manually resized the image, which is a more reliable signal than a
// site-wide guess.
const GENERIC_SIZES_DEFAULT = "(max-width: 768px) 100vw, 700px";

// srcset's own "url Nw" pairs are fully self-describing, so an image's
// available Variants round-trip straight out of the DOM attribute — no
// hidden data-* attribute needed to preserve them across a save/reload.
function parseSrcset(srcset: string): ImageSource[] {
  const sources: ImageSource[] = [];
  for (const entry of srcset.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 2) continue;
    const [url, descriptor] = parts;
    if (!descriptor.endsWith("w")) continue; // skip density ("2x") descriptors from foreign/pasted HTML
    const width = parseInt(descriptor.slice(0, -1), 10);
    if (isNaN(width)) continue;
    sources.push({ url, width });
  }
  return sources;
}

function convertImageElement(domNode: Node): { node: ImageNode } | null {
  if (domNode instanceof HTMLImageElement) {
    const styleWidth = parseInt(domNode.style.width);
    const attrWidth = parseInt(domNode.getAttribute("width") ?? "");
    const width = !isNaN(styleWidth)
      ? styleWidth
      : !isNaN(attrWidth)
        ? attrWidth
        : null;
    const srcsetAttr = domNode.getAttribute("srcset");
    const sources = srcsetAttr ? parseSrcset(srcsetAttr) : [];
    return {
      node: $createImageNode(
        domNode.getAttribute("src") ?? domNode.src,
        domNode.alt,
        width,
        sources.length > 0 ? sources : null,
      ),
    };
  }
  return null;
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: number | null;
  __sources: ImageSource[] | null;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__sources,
      node.__key,
    );
  }

  static importJSON(data: SerializedImageNode): ImageNode {
    return $createImageNode(
      data.src,
      data.altText,
      data.width ?? null,
      data.sources ?? null,
    );
  }

  static importDOM() {
    return {
      img: (_node: Node) => ({
        conversion: convertImageElement,
        priority: 0 as const,
      }),
    };
  }

  constructor(
    src: string,
    altText: string,
    width?: number | null,
    sources?: ImageSource[] | null,
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width ?? null;
    this.__sources = sources ?? null;
  }

  setWidth(width: number | null): void {
    const writable = this.getWritable();
    writable.__width = width;
  }

  setAltText(altText: string): void {
    const writable = this.getWritable();
    writable.__altText = altText;
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      type: "image",
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      sources: this.__sources,
    };
  }

  exportDOM(_editor: LexicalEditor): { element: HTMLElement } {
    const element = document.createElement("img");
    element.setAttribute("src", this.__src);
    element.setAttribute("alt", this.__altText);
    if (this.__width !== null) {
      element.style.width = `${this.__width}px`;
    }
    element.style.maxWidth = "100%";
    // A single-candidate srcset gives the browser nothing to choose
    // between — this also naturally covers thumb-only images with no
    // other generated Variants, with no special-casing needed here.
    if (this.__sources && this.__sources.length > 1) {
      element.setAttribute(
        "srcset",
        this.__sources.map((s) => `${s.url} ${s.width}w`).join(", "),
      );
      element.setAttribute(
        "sizes",
        this.__width !== null ? `${this.__width}px` : GENERIC_SIZES_DEFAULT,
      );
    }
    return { element };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.style.display = "contents";
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  decorate(_editor: LexicalEditor): JSX.Element {
    return (
      <ImageResizeDecorator
        nodeKey={this.__key}
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
      />
    );
  }
}

export function $createImageNode(
  src: string,
  altText: string,
  width?: number | null,
  sources?: ImageSource[] | null,
): ImageNode {
  return new ImageNode(src, altText, width, sources);
}
