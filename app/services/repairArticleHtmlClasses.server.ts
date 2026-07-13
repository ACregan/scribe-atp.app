import type { DocumentRecord } from "~/services/documentRepository.server";
import { sanitizeArticleHtml } from "~/services/article.server";

// Business logic for the /devtools/repair-article-html-classes tool,
// following the same pattern as the other repair-* devtools: a pure
// plan-builder used by both the loader (dry-run preview) and the action
// (re-derived there too, never trusts client state).
//
// Backfill counterpart to sanitizeArticleHtml() in article.server.ts, which
// stops *new* pollution at save time. This tool cleans up records saved
// before that fix existed — Lexical's exportDOM used to bake the CMS's own
// CSS-Modules editor classes (e.g. "_bold_v8vhs_375") directly into
// content.html, which are meaningless outside the CMS's build and go stale
// every time the CMS's CSS changes.

export type HtmlClassRepairItem = {
  rkey: string;
  title: string;
  removedClasses: string[];
};

export type HtmlClassRepairPlan = {
  toRepair: HtmlClassRepairItem[];
  alreadyClean: number;
};

const CLASS_ATTR_RE = /class="([^"]*)"/g;

function extractClasses(html: string): Set<string> {
  const classes = new Set<string>();
  for (const match of html.matchAll(CLASS_ATTR_RE)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) classes.add(token);
    }
  }
  return classes;
}

export function buildHtmlClassRepairPlan(
  documents: DocumentRecord[],
): HtmlClassRepairPlan {
  const toRepair: HtmlClassRepairItem[] = [];
  let alreadyClean = 0;

  for (const doc of documents) {
    const content = doc.value.content as { html?: string } | undefined;
    const html = content?.html;
    if (!html) {
      alreadyClean++;
      continue;
    }

    const sanitized = sanitizeArticleHtml(html);
    if (sanitized === html) {
      alreadyClean++;
      continue;
    }

    const before = extractClasses(html);
    const after = extractClasses(sanitized);
    const removedClasses = [...before]
      .filter((token) => !after.has(token))
      .sort();

    toRepair.push({
      rkey: doc.rkey,
      title: String(doc.value.title ?? "Untitled"),
      removedClasses,
    });
  }

  return { toRepair, alreadyClean };
}
