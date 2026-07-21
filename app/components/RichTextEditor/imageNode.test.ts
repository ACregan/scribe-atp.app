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

  it("omits srcset/sizes when sources is null", async () => {
    await withEditor((editor) => {
      const node = $createImageNode("https://example.com/img.webp", "alt");
      const { element } = node.exportDOM(editor);
      const img = element as HTMLImageElement;
      expect(img.hasAttribute("srcset")).toBe(false);
      expect(img.hasAttribute("sizes")).toBe(false);
    });
  });

  it("omits srcset/sizes when sources has only one entry", async () => {
    await withEditor((editor) => {
      const node = $createImageNode(
        "https://example.com/thumb.webp",
        "alt",
        null,
        [{ url: "https://example.com/thumb.webp", width: 300 }],
      );
      const { element } = node.exportDOM(editor);
      const img = element as HTMLImageElement;
      expect(img.hasAttribute("srcset")).toBe(false);
      expect(img.hasAttribute("sizes")).toBe(false);
    });
  });

  it("emits srcset and the generic sizes default when sources has multiple entries and no manual width", async () => {
    await withEditor((editor) => {
      const node = $createImageNode(
        "https://example.com/1200.webp",
        "alt",
        null,
        [
          { url: "https://example.com/600.webp", width: 600 },
          { url: "https://example.com/1200.webp", width: 1200 },
          { url: "https://example.com/max.webp", width: 3000 },
        ],
      );
      const { element } = node.exportDOM(editor);
      const img = element as HTMLImageElement;
      expect(img.getAttribute("srcset")).toBe(
        "https://example.com/600.webp 600w, https://example.com/1200.webp 1200w, https://example.com/max.webp 3000w",
      );
      expect(img.getAttribute("sizes")).toBe("(max-width: 768px) 100vw, 700px");
    });
  });

  it("uses the manual width in pixels for sizes when the author has resized the image", async () => {
    await withEditor((editor) => {
      const node = $createImageNode("https://example.com/1200.webp", "alt", 400, [
        { url: "https://example.com/600.webp", width: 600 },
        { url: "https://example.com/1200.webp", width: 1200 },
      ]);
      const { element } = node.exportDOM(editor);
      const img = element as HTMLImageElement;
      expect(img.getAttribute("sizes")).toBe("400px");
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

  it("preserves sources through exportJSON / importJSON", async () => {
    await withEditor(() => {
      const sources = [{ url: "https://example.com/600.webp", width: 600 }];
      const node = $createImageNode(
        "https://example.com/600.webp",
        "alt",
        null,
        sources,
      );
      const json = node.exportJSON();
      expect(json.sources).toEqual(sources);
      const restored = ImageNode.importJSON(json);
      expect(restored.__sources).toEqual(sources);
    });
  });

  it("defaults sources to null when field is absent (backwards compat)", async () => {
    await withEditor(() => {
      const node = $createImageNode("https://example.com/img.webp", "alt");
      const json = node.exportJSON();
      const { sources: _omitted, ...jsonWithoutSources } = json;
      const restored = ImageNode.importJSON(
        jsonWithoutSources as typeof json & { sources?: typeof json.sources },
      );
      expect(restored.__sources).toBeNull();
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

  it("preserves relative src attribute without browser resolution", async () => {
    const img = document.createElement("img");
    img.setAttribute("src", "/image-storage/did:plc:abc/uuid/max.webp");
    img.setAttribute("alt", "photo");

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__src).toBe(
        "/image-storage/did:plc:abc/uuid/max.webp",
      );
    });
  });

  it("parses a srcset attribute into sources", async () => {
    const img = document.createElement("img");
    img.setAttribute("src", "https://example.com/1200.webp");
    img.setAttribute(
      "srcset",
      "https://example.com/600.webp 600w, https://example.com/1200.webp 1200w",
    );

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__sources).toEqual([
        { url: "https://example.com/600.webp", width: 600 },
        { url: "https://example.com/1200.webp", width: 1200 },
      ]);
    });
  });

  it("leaves sources as null when no srcset attribute is present (old saved articles)", async () => {
    const img = document.createElement("img");
    img.setAttribute("src", "https://example.com/max.webp");

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__sources).toBeNull();
    });
  });

  it("ignores density (x) descriptors from foreign/pasted HTML", async () => {
    const img = document.createElement("img");
    img.setAttribute("src", "https://example.com/1200.webp");
    img.setAttribute(
      "srcset",
      "https://example.com/1200.webp 1x, https://example.com/2400.webp 2x",
    );

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__sources).toBeNull();
    });
  });

  it("leaves sources as null for an empty srcset attribute", async () => {
    const img = document.createElement("img");
    img.setAttribute("src", "https://example.com/max.webp");
    img.setAttribute("srcset", "");

    await withEditor(() => {
      const result = ImageNode.importDOM()!.img(img).conversion(img);
      expect((result as { node: ImageNode }).node.__sources).toBeNull();
    });
  });
});

// ─── setAltText ───────────────────────────────────────────────────────────────

describe("ImageNode.setAltText", () => {
  it("updates the alt attribute in exportDOM output", async () => {
    await withEditor((editor) => {
      const node = $createImageNode("https://example.com/img.webp", "original");
      node.setAltText("updated description");
      const { element } = node.exportDOM(editor);
      expect((element as HTMLImageElement).getAttribute("alt")).toBe(
        "updated description",
      );
    });
  });

  it("allows setting empty alt text for decorative images", async () => {
    await withEditor((editor) => {
      const node = $createImageNode("https://example.com/img.webp", "original");
      node.setAltText("");
      const { element } = node.exportDOM(editor);
      expect((element as HTMLImageElement).getAttribute("alt")).toBe("");
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

  it("preserves sources in the cloned node", async () => {
    await withEditor(() => {
      const sources = [{ url: "https://example.com/600.webp", width: 600 }];
      const node = $createImageNode(
        "https://example.com/600.webp",
        "alt",
        null,
        sources,
      );
      const cloned = ImageNode.clone(node);
      expect(cloned.__sources).toEqual(sources);
    });
  });

  it("clones null sources correctly", async () => {
    await withEditor(() => {
      const node = $createImageNode("https://example.com/img.webp", "alt");
      const cloned = ImageNode.clone(node);
      expect(cloned.__sources).toBeNull();
    });
  });
});
