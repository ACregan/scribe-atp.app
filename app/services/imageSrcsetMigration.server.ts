import type { Agent } from "@atproto/api";
import Database from "better-sqlite3";
import path from "node:path";
import { JSDOM } from "jsdom";
import { listDocuments, putDocument } from "./documentRepository.server";
import { sanitizeArticleHtml } from "./article.server";
import { GENERIC_SIZES_DEFAULT } from "~/components/RichTextEditor/imageNode";
import type { ImageSource } from "~/components/ImagePickerModal/imageBrowserTypes";
import { logger } from "./logger.server";

// One-time devtools migration (ADR 0029 only made *new* editor image
// insertions get a srcset — this backfills every article written before
// that shipped). Delete alongside its route once both known accounts
// (norobots.blog, anthonycregan.dev) have been migrated, per this repo's
// "chore: remove devtools/repair-*" convention.

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

function buildSources(
  sizes: ImageSizes,
  origin: string,
  did: string,
  filename: string,
): ImageSource[] {
  return Object.entries(sizes).map(([variant, { width }]) => ({
    url: `${origin}/image-storage/${did}/${filename}/${variant}.webp`,
    width,
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
    if (img.hasAttribute("srcset")) continue;

    const src = img.getAttribute("src");
    if (!src) continue;

    const isAbsolute = /^https?:\/\//.test(src);
    const parsed = new URL(src, "https://placeholder.invalid");
    const match = parsed.pathname.match(IMAGE_STORAGE_PATH_RE);
    if (!match) continue; // external/pasted image, not Scribe-hosted

    // The did embedded in the URL is whoever originally uploaded this
    // specific image (variantUrl always builds from image.user_did) — not
    // necessarily this document's own author, since a site-owned folder's
    // images may have been uploaded by any accepted Contributor. Look up
    // and rebuild sibling URLs using that did, not the document owner's.
    const [, imageDid, filename] = match;
    const sizes = lookupSizes(filename, imageDid);
    if (!sizes) continue; // deleted from the library since publish

    // Every Scribe-inserted image's src is already absolute (handlePick
    // always absolutizes at insert time) — reuse that same origin for
    // sibling URLs rather than assuming scribe-cms.app. Fall back to
    // relative in the unexpected case of a hand-edited/malformed record.
    const origin = isAbsolute ? parsed.origin : "";
    const sources = buildSources(sizes, origin, imageDid, filename);

    const beforeTag = img.outerHTML;
    if (!applySrcset(img, sources)) continue;
    images.push({ filename, beforeTag, afterTag: img.outerHTML });
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
