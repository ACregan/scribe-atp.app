import { describe, it, expect, afterEach } from "vitest";
import sharp from "sharp";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateVariants } from "./variants.js";

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

const tmpDirs: string[] = [];
async function makeOutputDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "variants-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("generateVariants", () => {
  it("only generates 'max' for an image smaller than the smallest intermediate box (300)", async () => {
    const input = await makeImage(50, 50);
    const outputDir = await makeOutputDir();

    const { sizes, sourceWidth, sourceHeight } = await generateVariants(input, outputDir);

    expect(sourceWidth).toBe(50);
    expect(sourceHeight).toBe(50);
    expect(Object.keys(sizes).sort()).toEqual(["max"]);
    // Never upscaled — max matches the source dimensions exactly.
    expect(sizes.max.width).toBe(50);
    expect(sizes.max.height).toBe(50);
  });

  it("generates only the intermediate variants at or below the source size, plus max", async () => {
    const input = await makeImage(500, 500);
    const outputDir = await makeOutputDir();

    const { sizes } = await generateVariants(input, outputDir);

    // 500 >= 300 (thumb generated) but < 600, 1200, 1800 (skipped).
    expect(Object.keys(sizes).sort()).toEqual(["max", "thumb"]);
    expect(sizes.thumb.width).toBeLessThanOrEqual(300);
  });

  it("generates every intermediate variant when the source is large enough for all of them", async () => {
    const input = await makeImage(2000, 2000);
    const outputDir = await makeOutputDir();

    const { sizes } = await generateVariants(input, outputDir);

    expect(Object.keys(sizes).sort()).toEqual(["1200", "1800", "600", "max", "thumb"]);
    // Under the 3000 cap — max is the full, unscaled source size.
    expect(sizes.max.width).toBe(2000);
    expect(sizes.max.height).toBe(2000);
  });

  it("caps 'max' at 3000px for a source larger than the cap, without upscaling anything", async () => {
    const input = await makeImage(3500, 3500);
    const outputDir = await makeOutputDir();

    const { sizes, sourceWidth } = await generateVariants(input, outputDir);

    expect(sourceWidth).toBe(3500);
    expect(sizes.max.width).toBe(3000);
    expect(sizes.max.height).toBe(3000);
  });

  it("preserves aspect ratio for non-square sources", async () => {
    const input = await makeImage(1600, 800); // 2:1
    const outputDir = await makeOutputDir();

    const { sizes } = await generateVariants(input, outputDir);

    // "600" box constrains the longest side (width) to 600; height follows.
    expect(sizes["600"].width).toBe(600);
    expect(sizes["600"].height).toBe(300);
  });

  it("invokes the onVariant callback once per generated variant, in generation order", async () => {
    const input = await makeImage(500, 500);
    const outputDir = await makeOutputDir();
    const seen: string[] = [];

    await generateVariants(input, outputDir, (name) => seen.push(name));

    expect(seen).toEqual(["thumb", "max"]);
  });

  it("writes the expected .webp files to outputDir", async () => {
    const input = await makeImage(500, 500);
    const outputDir = await makeOutputDir();

    await generateVariants(input, outputDir);

    const files = await fs.readdir(outputDir);
    expect(files.sort()).toEqual(["max.webp", "thumb.webp"]);
  });
});
