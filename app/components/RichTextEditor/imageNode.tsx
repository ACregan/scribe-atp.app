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

export type InsertImagePayload = { src: string; altText: string };

export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> =
  createCommand("INSERT_IMAGE_COMMAND");

type SerializedImageNode = SerializedLexicalNode & {
  src: string;
  altText: string;
  width?: number | null;
};

function convertImageElement(domNode: Node): { node: ImageNode } | null {
  if (domNode instanceof HTMLImageElement) {
    const styleWidth = parseInt(domNode.style.width);
    const attrWidth = parseInt(domNode.getAttribute("width") ?? "");
    const width = !isNaN(styleWidth)
      ? styleWidth
      : !isNaN(attrWidth)
        ? attrWidth
        : null;
    return {
      node: $createImageNode(
        domNode.getAttribute("src") ?? domNode.src,
        domNode.alt,
        width,
      ),
    };
  }
  return null;
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: number | null;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__width, node.__key);
  }

  static importJSON(data: SerializedImageNode): ImageNode {
    return $createImageNode(data.src, data.altText, data.width ?? null);
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
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width ?? null;
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
): ImageNode {
  return new ImageNode(src, altText, width);
}
