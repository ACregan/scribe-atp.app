import { describe, it, expect } from "vitest";
import path from "path";
import { isPathWithinRoot } from "./vite.config";

const ROOT = "/var/scribe/images";

describe("isPathWithinRoot", () => {
  it("accepts a path directly inside root", () => {
    expect(isPathWithinRoot(path.join(ROOT, "did/uuid/thumb.webp"), ROOT)).toBe(
      true,
    );
  });

  it("accepts the root itself", () => {
    expect(isPathWithinRoot(ROOT, ROOT)).toBe(true);
  });

  it("bug fix: rejects a sibling directory that merely shares root as a string prefix", () => {
    expect(isPathWithinRoot("/var/scribe/images-secret/x", ROOT)).toBe(false);
  });

  it("rejects a path traversal that escapes root via ..", () => {
    expect(
      isPathWithinRoot(path.resolve(ROOT, "../images-secret/x"), ROOT),
    ).toBe(false);
  });

  it("rejects an unrelated absolute path", () => {
    expect(isPathWithinRoot("/etc/passwd", ROOT)).toBe(false);
  });
});
