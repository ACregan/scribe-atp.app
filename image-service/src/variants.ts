import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";

export type VariantSizes = Record<
  string,
  { width: number; height: number; bytes: number }
>;

const INTERMEDIATE_VARIANTS = [
  { name: "thumb", box: 300 },
  { name: "600", box: 600 },
  { name: "1200", box: 1200 },
  { name: "1800", box: 1800 },
] as const;

const MAX_BOX_CAP = 3000;

export async function generateVariants(
  inputBuffer: Buffer,
  outputDir: string,
  onVariant?: (
    name: string,
    dims: { width: number; height: number; bytes: number },
  ) => void,
): Promise<{ sizes: VariantSizes; sourceWidth: number; sourceHeight: number }> {
  await fs.mkdir(outputDir, { recursive: true });

  const metadata = await sharp(inputBuffer).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  const longestSide = Math.max(sourceWidth, sourceHeight);

  const sizes: VariantSizes = {};

  for (const { name, box } of INTERMEDIATE_VARIANTS) {
    if (longestSide < box) continue;

    const result = await sharp(inputBuffer)
      .resize(box, box, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toFile(path.join(outputDir, `${name}.webp`));

    sizes[name] = {
      width: result.width,
      height: result.height,
      bytes: result.size,
    };
    onVariant?.(name, sizes[name]);
  }

  // max is always generated — at source dimensions, capped at MAX_BOX_CAP
  const maxResult =
    longestSide <= MAX_BOX_CAP
      ? await sharp(inputBuffer).webp().toFile(path.join(outputDir, "max.webp"))
      : await sharp(inputBuffer)
          .resize(MAX_BOX_CAP, MAX_BOX_CAP, { fit: "inside" })
          .webp()
          .toFile(path.join(outputDir, "max.webp"));

  sizes["max"] = {
    width: maxResult.width,
    height: maxResult.height,
    bytes: maxResult.size,
  };
  onVariant?.("max", sizes["max"]);

  return { sizes, sourceWidth, sourceHeight };
}
