import type { Agent } from "@atproto/api";
import Database from "better-sqlite3";
import path from "node:path";
import { JSDOM } from "jsdom";
import { listDocuments, putDocument } from "./documentRepository.server";
import { sanitizeArticleHtml } from "./article.server";
import { GENERIC_SIZES_DEFAULT } from "~/components/RichTextEditor/imageNode";
import {
  VARIANT_ORDER,
  type ImageSource,
} from "~/components/ImagePickerModal/imageBrowserTypes";
import { logger } from "./logger.server";

// One-time devtools migration (ADR 0029 only made *new* editor image
// insertions get a srcset — this backfills every article written before
// that shipped). Also self-heals any image already migrated with the
// short-lived broken GENERIC_SIZES_DEFAULT (a fixed 700px that forcibly
// shrank unconstrained images on norobots.blog — see STALE_SIZES_700PX
// below) — running this again is always safe and picks up any outstanding
// fix. Delete alongside its route once both known accounts (norobots.blog,
// anthonycregan.dev) have been migrated, per this repo's "chore: remove
// devtools/repair-*" convention.

export type ProposedImageChange = {
  filename: string;
  beforeTag: string;
  afterTag: string;
};

export type ProposedDocumentChange = {
  uri: string;
  rkey: string;
  cid: string;
  title: string;
  images: ProposedImageChange[];
  updatedHtml: string;
};

export type MigrationPlan = {
  changes: ProposedDocumentChange[];
  totalImages: number;
};

export type ApplyResult = { rkey: string; ok: boolean; error?: string };

// Same-host, same-filesystem cross-process read of the Image Service's own
// SQLite database — the reverse direction of the read ADR 0024 already
// established (there, the image-service reads the CMS's oauth.db the same
// way). readonly: true is a real guarantee, not just an intent — this
// module has no code path that could ever write to images.db even if a
// future edit introduced a bug that tried to.
let imageDb: Database.Database | undefined;

function getImageDb(): Database.Database {
  if (!imageDb) {
    const imageDbPath =
      process.env.IMAGE_DB_PATH ?? path.join(process.cwd(), "data", "images.db");
    imageDb = new Database(imageDbPath, { readonly: true });
  }
  return imageDb;
}

type ImageSizes = Record<string, { width: number; height: number; bytes?: number }>;

function lookupSizes(filename: string, userDid: string): ImageSizes | null {
  const row = getImageDb()
    .prepare("SELECT sizes FROM images WHERE filename = ? AND user_did = ?")
    .get(filename, userDid) as { sizes: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.sizes) as ImageSizes;
}

// Matches variantUrl()'s output shape exactly (imageBrowserTypes.ts):
// /image-storage/{did}/{filename}/{variant}.webp
const IMAGE_STORAGE_PATH_RE = /^\/image-storage\/([^/]+)\/([^/]+)\/[^/]+\.webp$/;

// GENERIC_SIZES_DEFAULT's old value, before it was corrected from a fixed
// 700px guess to 100vw (see imageNode.tsx's comment on the constant) — sizes
// becomes an image's actual rendered CSS width when nothing else sets one,
// so this fixed value forcibly shrank every unconstrained image on
// norobots.blog to 700px regardless of its real container width. Used only
// to detect and repair images already migrated with the broken value; not
// otherwise meaningful.
const STALE_SIZES_700PX = "(max-width: 768px) 100vw, 700px";

function parseImageStorageUrl(
  src: string,
): { did: string; filename: string; origin: string } | null {
  const isAbsolute = /^https?:\/\//.test(src);
  const parsed = new URL(src, "https://placeholder.invalid");
  const match = parsed.pathname.match(IMAGE_STORAGE_PATH_RE);
  if (!match) return null;
  const [, did, filename] = match;
  return { did, filename, origin: isAbsolute ? parsed.origin : "" };
}

// Object.entries(sizes) is NOT a safe iteration order here — JS engines
// enumerate integer-like string keys ("600", "1200", "1800") in ascending
// numeric order ahead of non-numeric keys ("thumb", "max") regardless of
// original insertion order, producing e.g. 600,1200,1800,thumb,max instead
// of the canonical thumb,600,1200,1800,max. Not a functional bug (srcset
// resolution doesn't depend on list order) but it broke byte-identical
// output with ImagePickerModal.handlePick, which iterates VARIANT_ORDER —
// iterate the same fixed order here for consistency.
function buildSources(
  sizes: ImageSizes,
  origin: string,
  did: string,
  filename: string,
): ImageSource[] {
  return VARIANT_ORDER.filter((variant) => variant in sizes).map((variant) => ({
    url: `${origin}/image-storage/${did}/${filename}/${variant}.webp`,
    width: sizes[variant].width,
  }));
}

// Mirrors ImageNode.exportDOM exactly (imageNode.tsx) so migrated and
// freshly-inserted images produce byte-identical markup. Returns false
// (no-op) for a single-candidate sources array — nothing for the browser
// to choose between, same guard exportDOM uses.
function applySrcset(img: HTMLImageElement, sources: ImageSource[]): boolean {
  if (sources.length <= 1) return false;
  img.setAttribute(
    "srcset",
    sources.map((s) => `${s.url} ${s.width}w`).join(", "),
  );
  const styleWidth = parseInt(img.style.width);
  img.setAttribute(
    "sizes",
    !isNaN(styleWidth) ? `${styleWidth}px` : GENERIC_SIZES_DEFAULT,
  );
  return true;
}

// Reused across every document processed in a run — content.html is always
// a fragment, never a full document, so body.innerHTML is the only thing
// ever read or written here; a fresh JSDOM per document would be wasted work.
const dom = new JSDOM("<!DOCTYPE html><body></body>");

function processDocumentHtml(html: string): {
  images: ProposedImageChange[];
  updatedHtml: string;
} {
  const { document } = dom.window;
  document.body.innerHTML = html;

  const images: ProposedImageChange[] = [];
  for (const img of Array.from(document.body.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (!src) continue;

    if (img.hasAttribute("srcset")) {
      // Already migrated. The only thing worth revisiting is a sizes value
      // still carrying the old broken constant — srcset/src are otherwise
      // left completely untouched. A manual per-image width (e.g. "400px")
      // was always correct and is left alone.
      if (img.getAttribute("sizes") !== STALE_SIZES_700PX) continue;
      const parsed = parseImageStorageUrl(src);
      if (!parsed) continue;
      const beforeTag = img.outerHTML;
      const styleWidth = parseInt(img.style.width);
      img.setAttribute(
        "sizes",
        !isNaN(styleWidth) ? `${styleWidth}px` : GENERIC_SIZES_DEFAULT,
      );
      images.push({ filename: parsed.filename, beforeTag, afterTag: img.outerHTML });
      continue;
    }

    const parsed = parseImageStorageUrl(src);
    if (!parsed) continue; // external/pasted image, not Scribe-hosted

    // The did embedded in the URL is whoever originally uploaded this
    // specific image (variantUrl always builds from image.user_did) — not
    // necessarily this document's own author, since a site-owned folder's
    // images may have been uploaded by any accepted Contributor. Look up
    // and rebuild sibling URLs using that did, not the document owner's.
    const sizes = lookupSizes(parsed.filename, parsed.did);
    if (!sizes) continue; // deleted from the library since publish

    const sources = buildSources(sizes, parsed.origin, parsed.did, parsed.filename);

    const beforeTag = img.outerHTML;
    if (!applySrcset(img, sources)) continue;
    images.push({ filename: parsed.filename, beforeTag, afterTag: img.outerHTML });
  }

  return { images, updatedHtml: document.body.innerHTML };
}

export async function buildMigrationPlan(
  agent: Agent,
  did: string,
): Promise<MigrationPlan> {
  const documents = await listDocuments(agent, did);
  const changes: ProposedDocumentChange[] = [];
  let totalImages = 0;

  for (const doc of documents) {
    const content = doc.value.content as { html?: string } | undefined;
    if (!content?.html) continue;

    const { images, updatedHtml } = processDocumentHtml(content.html);
    if (images.length === 0) continue;

    changes.push({
      uri: doc.uri,
      rkey: doc.rkey,
      cid: doc.cid,
      title: String(doc.value.title ?? doc.rkey),
      images,
      updatedHtml: sanitizeArticleHtml(updatedHtml),
    });
    totalImages += images.length;
  }

  return { changes, totalImages };
}

export async function applyMigrationPlan(
  agent: Agent,
  did: string,
  plan: MigrationPlan,
): Promise<ApplyResult[]> {
  const documents = await listDocuments(agent, did);
  const byRkey = new Map(documents.map((d) => [d.rkey, d]));

  const results: ApplyResult[] = [];
  for (const change of plan.changes) {
    const doc = byRkey.get(change.rkey);
    if (!doc) {
      results.push({
        rkey: change.rkey,
        ok: false,
        error: "Record no longer exists",
      });
      continue;
    }
    try {
      const content = (doc.value.content as Record<string, unknown>) ?? {};
      await putDocument(
        agent,
        did,
        change.rkey,
        { ...doc.value, content: { ...content, html: change.updatedHtml } },
        doc.cid,
      );
      results.push({ rkey: change.rkey, ok: true });
      logger.info(
        {
          event: "image_srcset_migration.document",
          user_did: did,
          rkey: change.rkey,
          images: change.images.length,
        },
        "image_srcset_migration.document",
      );
    } catch (err) {
      results.push({ rkey: change.rkey, ok: false, error: String(err) });
      logger.error(
        {
          event: "image_srcset_migration.document_error",
          user_did: did,
          rkey: change.rkey,
          error: String(err),
        },
        "image_srcset_migration.document_error",
      );
    }
  }

  logger.warn(
    {
      event: "image_srcset_migration.run",
      user_did: did,
      migrated: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    },
    "image_srcset_migration.run",
  );

  return results;
}
