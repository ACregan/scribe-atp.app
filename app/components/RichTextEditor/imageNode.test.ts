import { describe, it, expect } from "vitest";
import { $createImageNode, ImageNode } from "./imageNode";
import { createEditor, type LexicalEditor } from "lexical";

// Lexical nodes require an active editor state to construct.
// This helper runs a callback inside editor.update() so $createImageNode works.
async function withEditor(fn: (editor: LexicalEditor) => void): Promise<void> {
  const editor = createEditor({ nodes: [ImageNode] });
  return new Promise<void>((resolve, reject) => {
    editor.update(() => {
      try {
        fn(editor);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ─── exportDOM ────────────────────────────────────────────────────────────────

describe("ImageNode.exportDOM", () => {
  it("sets max-width: 100% and no width when __width is null", async () => {
    await withEditor((editor) => {
      const node = $createImageNode("https://example.com/img.webp", "alt");
      const { element } = node.exportDOM(editor);
      const img = element as HTMLImageElement;
      expect(img.style.width).toBe("");
      expect(img.style.maxWidth).toBe("100%");
      expect(img.getAttribute("src")).toBe("https://example.com/img.webp");
      expect(img.getAttribute("alt")).toBe("alt");
    });
  });

  it("sets width and max-width when __width is a number", async () => {
    await withEditor((editor) => {
      const node = $createImageNode("https://example.com/img.webp", "alt", 480);
      const { element } = node.exportDOM(editor);
      const img = element as HTMLImageElement;
      expect(img.style.width).toBe("480px");
      expect(img.style.maxWidth).toBe("100%");
    });
  });
});

// ─── exportJSON / importJSON ──────────────────────────────────────────────────

describe("ImageNode JSON round-trip", () => {
  it("preserves width through exportJSON / importJSON", async () => {
    await withEditor(() => {
      const node = $createImageNode("https://example.com/img.webp", "alt", 640);
      const json = node.exportJSON();
      expect(json.width).toBe(640);
      const restored = ImageNode.importJSON(json);
      expect(restored.__width).toBe(640);
    });
  });

  it("preserves null width through exportJSON / importJSON", async () => {
    await withEditor(() => {
      const node = $createImageNode("https://example.com/img.webp", "alt");
      const json = node.exportJSON();
      expect(json.width).toBeNull();
      const restored = ImageNode.importJSON(json);
      expect(restored.__width).toBeNull();
    });
  });

  it("defaults width to null when field is absent (backwards compat)", async () => {
    await withEditor(() => {
      const node = $createImageNode("https://example.com/img.webp", "alt", 480);
      const json = node.exportJSON();
      const { width: _omitted, ...jsonWithoutWidth } = json;
      const restored = ImageNode.importJSON(
        jsonWithoutWidth as typeof json & { width?: number | null },
      );
      expect(restored.__width).toBeNull();
    });
  });
});

// ─── convertImageElement (importDOM) ─────────────────────────────────────────

describe("convertImageElement", () => {
  it("reads width from inline style", async () => {
    const img = document.createElement("img");
    img.src = "https://example.com/img.webp";
    img.alt = "photo";
    img.style.width = "480px";

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__width).toBe(480);
    });
  });

  it("falls back to width HTML attribute when style is absent", async () => {
    const img = document.createElement("img");
    img.src = "https://example.com/img.webp";
    img.setAttribute("width", "320");

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__width).toBe(320);
    });
  });

  it("prefers inline style over width attribute", async () => {
    const img = document.createElement("img");
    img.src = "https://example.com/img.webp";
    img.style.width = "480px";
    img.setAttribute("width", "320");

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__width).toBe(480);
    });
  });

  it("leaves width as null when neither style nor attribute is present", async () => {
    const img = document.createElement("img");
    img.src = "https://example.com/img.webp";

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__width).toBeNull();
    });
  });
});

// ─── clone ────────────────────────────────────────────────────────────────────

describe("ImageNode.clone", () => {
  it("preserves width in the cloned node", async () => {
    await withEditor(() => {
      const node = $createImageNode("https://example.com/img.webp", "alt", 360);
      const cloned = ImageNode.clone(node);
      expect(cloned.__width).toBe(360);
      expect(cloned.__src).toBe("https://example.com/img.webp");
      expect(cloned.__altText).toBe("alt");
    });
  });

  it("clones null width correctly", async () => {
    await withEditor(() => {
      const node = $createImageNode("https://example.com/img.webp", "alt");
      const cloned = ImageNode.clone(node);
      expect(cloned.__width).toBeNull();
    });
  });
});
