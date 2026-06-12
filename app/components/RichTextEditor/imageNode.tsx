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

export type InsertImagePayload = { src: string; altText: string };

export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> =
  createCommand("INSERT_IMAGE_COMMAND");

type SerializedImageNode = SerializedLexicalNode & {
  src: string;
  altText: string;
};

function convertImageElement(domNode: Node): { node: ImageNode } | null {
  if (domNode instanceof HTMLImageElement) {
    return { node: $createImageNode(domNode.src, domNode.alt) };
  }
  return null;
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__key);
  }

  static importJSON(data: SerializedImageNode): ImageNode {
    return $createImageNode(data.src, data.altText);
  }

  static importDOM() {
    return {
      img: () => ({
        conversion: convertImageElement,
        priority: 0 as const,
      }),
    };
  }

  constructor(src: string, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
  }

  exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      type: "image",
      src: this.__src,
      altText: this.__altText,
    };
  }

  exportDOM(): { element: HTMLElement } {
    const element = document.createElement("img");
    element.setAttribute("src", this.__src);
    element.setAttribute("alt", this.__altText);
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
      <img
        src={this.__src}
        alt={this.__altText}
        style={{ maxWidth: "100%", display: "block", margin: "0.8rem 0" }}
      />
    );
  }
}

export function $createImageNode(src: string, altText: string): ImageNode {
  return new ImageNode(src, altText);
}
