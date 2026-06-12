import {
  $isTextNode,
  TextNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type LexicalNode,
  type SerializedTextNode,
} from "lexical";

// Extends TextNode solely to register a higher-priority span converter that
// preserves inline CSS properties (color, background-color, font-family,
// font-size) that Lexical's built-in TextNode span converter silently drops on
// DOM import.
export class ExtendedTextNode extends TextNode {
  static getType(): string {
    return "extended-text";
  }

  static clone(node: ExtendedTextNode): ExtendedTextNode {
    return new ExtendedTextNode(node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedTextNode): ExtendedTextNode {
    const node = new ExtendedTextNode(serializedNode.text);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  exportJSON(): SerializedTextNode {
    return { ...super.exportJSON(), type: "extended-text", version: 1 };
  }

  static importDOM(): DOMConversionMap | null {
    const textImporters = TextNode.importDOM();
    const originalSpan = textImporters?.span;

    return {
      span: (domNode: HTMLElement) => {
        const originalEntry = originalSpan?.(domNode);
        return {
          conversion: (el: HTMLElement): DOMConversionOutput | null => {
            const originalOutput: DOMConversionOutput =
              originalEntry?.conversion(el) ?? { node: null };

            const style = el.getAttribute("style");
            if (!style) return originalOutput;

            // Read only the properties the default converter ignores.
            // Bold/italic/underline/strikethrough remain as format flags via
            // the original converter.
            const tmp = document.createElement("span");
            tmp.setAttribute("style", style);
            const parts: string[] = [];
            if (tmp.style.color) parts.push(`color: ${tmp.style.color}`);
            if (tmp.style.backgroundColor)
              parts.push(`background-color: ${tmp.style.backgroundColor}`);
            if (tmp.style.fontFamily)
              parts.push(`font-family: ${tmp.style.fontFamily}`);
            if (tmp.style.fontSize)
              parts.push(`font-size: ${tmp.style.fontSize}`);

            const extraStyle = parts.join("; ");
            if (!extraStyle) return originalOutput;

            const originalForChild = originalOutput.forChild;
            return {
              ...originalOutput,
              forChild: (
                lexicalNode: LexicalNode,
                parent: LexicalNode | null | undefined,
              ): LexicalNode => {
                const result = originalForChild
                  ? originalForChild(lexicalNode, parent as never)
                  : lexicalNode;
                const target = result ?? lexicalNode;
                if ($isTextNode(target)) {
                  const existing = target.getStyle();
                  return target.setStyle(
                    existing ? `${existing}; ${extraStyle}` : extraStyle,
                  );
                }
                return target;
              },
            };
          },
          priority: 1,
        };
      },
    };
  }
}
