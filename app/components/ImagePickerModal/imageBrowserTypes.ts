export type BrowseFolder = {
  id: number;
  user_did: string;
  name: string;
  parent_id: number | null;
  created_at?: string;
};

export type BrowseImage = {
  id: number;
  user_did: string;
  filename: string;
  original_name: string;
  width: number;
  height: number;
  sizes: Record<string, { width: number; height: number; bytes?: number }>;
  created_at: string;
};

export type BrowseResponse = {
  folder: BrowseFolder | null;
  breadcrumbs: Array<{ id: number; name: string }>;
  subfolders: BrowseFolder[];
  images: BrowseImage[];
};

export const VARIANT_ORDER = ["thumb", "600", "1200", "1800", "max"];

export const VARIANT_LABEL: Record<string, string> = {
  thumb: "Thumb",
  "600": "600w",
  "1200": "1200w",
  "1800": "1800w",
  max: "Max",
};

export function variantUrl(image: BrowseImage, variant: string): string {
  return `/image-storage/${image.user_did}/${image.filename}/${variant}.webp`;
}

export function thumbUrl(image: BrowseImage): string {
  const variant =
    "thumb" in image.sizes
      ? "thumb"
      : "600" in image.sizes
        ? "600"
        : "1200" in image.sizes
          ? "1200"
          : "max";
  return variantUrl(image, variant);
}

export function largestSizeVariant(sizes: BrowseImage["sizes"]): string | null {
  for (let i = VARIANT_ORDER.length - 1; i >= 0; i--) {
    if (VARIANT_ORDER[i] !== "thumb" && VARIANT_ORDER[i] in sizes)
      return VARIANT_ORDER[i];
  }
  return null;
}
