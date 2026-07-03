import type { Route } from "./+types/edit";
import {
  Form,
  useNavigate,
  useBlocker,
  type BlockerFunction,
} from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  validateArticleFields,
  buildArticleRef,
  loadSiteOptions,
  resolveThumbUrl,
} from "~/services/article.server";
import {
  findSitesContaining,
  computeSiteAssignmentChanges,
  syncSiteArticleRefs,
} from "~/services/articleSiteSync.server";
import { hasTextContent } from "~/components/utils";
import { devEditLoader } from "~/services/devFixtures.server";
import { useState, useEffect } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import { logger } from "~/services/logger.server";
import {
  PageContainer,
  PageContainerHeading,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { SaveChecklist } from "~/components/SaveChecklist/SaveChecklist";
import {
  ArticleForm,
  type SiteOption,
} from "~/components/ArticleForm/ArticleForm";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Edit Article" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!useRealOAuth) return devEditLoader(params.articleUrl);

  const { agent, did } = await requireAtpAgent(request);
  const siteOptionsPromise = loadSiteOptions(agent, did);

  // Resolve human-readable slug → TID via listRecords scan.
  // slug = path.split('/').pop() for each site.standard.document record.
  const slug = params.articleUrl;
  const allRecords: Array<{ uri: string; cid: string; value: unknown }> = [];
  let cursor: string | undefined;
  do {
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      limit: 100,
      cursor,
    });
    allRecords.push(...(result.data.records as typeof allRecords));
    cursor = result.data.cursor;
  } while (cursor);

  const found = allRecords.find((r) => {
    const path = String((r.value as Record<string, unknown>).path ?? "");
    return path.split("/").pop() === slug;
  });

  if (!found) throw new Response("Article not found", { status: 404 });

  const rkey = found.uri.split("/").pop()!;
  const value = found.value as Record<string, unknown>;

  const rawContent = value.content;
  const content =
    typeof rawContent === "object" &&
    rawContent !== null &&
    (rawContent as Record<string, unknown>).$type === "app.scribe.content.html"
      ? String((rawContent as Record<string, unknown>).html ?? "")
      : String(rawContent ?? "");

  const articleUri = `at://${did}/${DOCUMENT_COLLECTION}/${rkey}`;
  const [sites, currentSiteRkeys] = await Promise.all([
    siteOptionsPromise,
    findSitesContaining(agent, did, articleUri),
  ]);

  const scribe = (value.scribe as Record<string, unknown>) ?? {};

  return {
    rkey,
    title: String(value.title ?? ""),
    content,
    slug,
    splashImageUrl: String(scribe.splashImageUrl ?? value.splashImageUrl ?? ""),
    description: String(value.description ?? ""),
    tags: Array.isArray(value.tags) ? (value.tags as string[]) : [],
    createdAt: String(scribe.createdAt ?? value.createdAt ?? new Date().toISOString()),
    cid: found.cid ?? null,
    sites,
    currentSiteRkeys,
    publishedSite: String(value.site ?? ""),
    publishedAt: String(value.publishedAt ?? ""),
    publishedPath: String(value.path ?? ""),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const newSlug = formData.get("url") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;
  const description = formData.get("description") as string;
  const tags = formData.getAll("tags") as string[];
  const cid = formData.get("cid") as string | null;
  const createdAt =
    (formData.get("createdAt") as string) || new Date().toISOString();
  const oldRkey = formData.get("rkey") as string; // TID — immutable
  const publishedSite = (formData.get("publishedSite") as string) || "";
  const publishedAt = (formData.get("publishedAt") as string) || "";
  const publishedPath = (formData.get("publishedPath") as string) || "";
  const oldSiteRkeys: string[] = JSON.parse(
    (formData.get("oldSiteRkeys") as string) || "[]",
  );

  const validationError = validateArticleFields(title, newSlug, splashImageUrl);
  if (validationError) return { ok: false as const, error: validationError };

  if (!useRealOAuth) return { ok: true as const, title };

  const currentSlug = publishedPath.split("/").pop()!;
  const slugChanged = newSlug !== currentSlug;

  try {
    const { agent, did } = await requireAtpAgent(request);
    const siteChanges = computeSiteAssignmentChanges(oldSiteRkeys, oldSiteRkeys);
    const now = new Date().toISOString();

    // Fetch existing record for blob caching and contributors preservation
    let existingDoc: Record<string, unknown> = {};
    try {
      const existingResult = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: oldRkey,
      });
      existingDoc = existingResult.data.value as Record<string, unknown>;
    } catch {
      // Non-fatal: proceed without existing data
    }

    const existingScribe =
      (existingDoc.scribe as Record<string, unknown>) ?? {};
    const contributors = Array.isArray(existingDoc.contributors)
      ? existingDoc.contributors
      : [];
    const existingCanonicalUrl =
      String((existingDoc.scribe as Record<string, unknown>)?.canonicalUrl ?? existingDoc.canonicalUrl ?? "");
    const existingBskyPostRef = existingDoc.bskyPostRef as
      | { uri: string; cid: string }
      | undefined;

    // Resolve site field: convert legacy AT URI to https:// URL
    let siteHttpsUrl = publishedSite;
    if (publishedSite.startsWith("at://")) {
      const siteRkey = publishedSite.split("/").pop()!;
      try {
        const siteRecord = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: siteRkey,
        });
        const scribe = (siteRecord.data.value as Record<string, unknown>).scribe as Record<string, unknown>;
        siteHttpsUrl = `https://${String(scribe?.domain ?? "")}`;
      } catch {
        siteHttpsUrl = "";
      }
    }

    // Upload cover image blob — only if URL changed or no cached blob exists
    let coverImageBlobRef: unknown;
    let coverImageUploadFailed = false;
    if (splashImageUrl?.trim()) {
      const existingCoverImageBlob = existingDoc.coverImage;
      const existingScribeForBlob = (existingDoc.scribe as Record<string, unknown>) ?? {};
      const existingSplashImageUrl = String(existingScribeForBlob.splashImageUrl ?? existingDoc.splashImageUrl ?? "");
      if (
        existingSplashImageUrl !== splashImageUrl ||
        !existingCoverImageBlob
      ) {
        try {
          const thumbSrc = resolveThumbUrl(splashImageUrl);
          let imgRes = await fetch(thumbSrc);
          if (!imgRes.ok && thumbSrc !== splashImageUrl) {
            imgRes = await fetch(splashImageUrl);
          }
          if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer();
            const mimeType =
              imgRes.headers.get("content-type") ?? "image/webp";
            const uploadRes = await agent.uploadBlob(
              new Uint8Array(imgBuffer),
              { encoding: mimeType },
            );
            coverImageBlobRef = uploadRes.data.blob;
          } else {
            coverImageUploadFailed = true;
          }
        } catch (blobErr) {
          logger.warn(
            {
              event: "article.update.cover_image_blob_error",
              error: String(blobErr),
            },
            "cover image blob upload error — save will proceed without coverImage",
          );
          coverImageUploadFailed = true;
        }
      } else {
        coverImageBlobRef = existingCoverImageBlob;
      }
    }

    const coverImageWarning = coverImageUploadFailed
      ? "Cover image could not be uploaded."
      : undefined;

    // Update path and canonicalUrl when slug changes; rkey (TID) stays constant
    const newPath = slugChanged
      ? publishedPath.replace(/\/[^/]+$/, `/${newSlug}`)
      : publishedPath;
    const newCanonicalUrl =
      slugChanged && existingCanonicalUrl
        ? existingCanonicalUrl.replace(/\/[^/]+$/, `/${newSlug}`)
        : existingCanonicalUrl;

    const textContent = content
      ? content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      : undefined;

    const updatedRecord: Record<string, unknown> = {
      $type: DOCUMENT_COLLECTION,
      title,
      content: { $type: "app.scribe.content.html", html: content },
      textContent: textContent || undefined,
      ...(coverImageBlobRef !== undefined
        ? { coverImage: coverImageBlobRef }
        : {}),
      description: description?.trim() || undefined,
      tags: tags.length ? tags : undefined,
      contributors,
      site: siteHttpsUrl,
      publishedAt,
      updatedAt: now,
      path: newPath,
      ...(existingBskyPostRef ? { bskyPostRef: existingBskyPostRef } : {}),
      scribe: {
        ...existingScribe,
        splashImageUrl: splashImageUrl?.trim() || undefined,
        createdAt,
        ...(newCanonicalUrl ? { canonicalUrl: newCanonicalUrl } : {}),
      },
    };

    // Always putRecord — rkey is the immutable TID, never recreated
    const putResult = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      rkey: oldRkey,
      record: updatedRecord,
      swapRecord: cid ?? undefined,
    });

    const uri = `at://${did}/${DOCUMENT_COLLECTION}/${oldRkey}`;
    const ref = buildArticleRef({
      uri,
      title,
      slug: newSlug,
      splashImageUrl,
      description,
      tags: tags.length ? tags : undefined,
      publishedAt,
      createdAt,
      updatedAt: now,
    });
    await syncSiteArticleRefs(agent, did, siteChanges, uri, ref);

    logger.info(
      {
        event: "article.update",
        user_did: did,
        rkey: oldRkey,
        slug_renamed: slugChanged,
      },
      "article.update",
    );

    if (slugChanged) {
      return { ok: true as const, title, newSlug, coverImageWarning };
    }
    return {
      ok: true as const,
      title,
      newCid: putResult.data.cid,
      coverImageWarning,
    };
  } catch (err) {
    console.error("Failed to update article:", err);
    return {
      ok: false as const,
      error:
        err instanceof Error
          ? err.message
          : "Failed to save. Please try again.",
    };
  }
}

export default function EditArticle({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    rkey,
    title,
    content,
    slug,
    splashImageUrl,
    description,
    tags,
    createdAt,
    cid,
    sites,
    currentSiteRkeys,
    publishedSite,
    publishedAt,
    publishedPath,
  } = loaderData;

  const [selectedSites, setSelectedSites] =
    useState<string[]>(currentSiteRkeys);
  const [isDirty, setIsDirty] = useState(false);
  // Initialise from loader data so canSave is correct before the user edits.
  const [titleValue, setTitleValue] = useState(title);
  const [urlValue, setUrlValue] = useState(slug);
  const [contentHtml, setContentHtml] = useState(content);
  // Held in state so it updates after a successful non-rename save without
  // re-running the loader (putRecord produces a new CID; stale CID would fail
  // the swapRecord check on the next save).
  const [cidValue, setCidValue] = useState(cid);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const slugChanged = urlValue !== slug;

  const canSave =
    titleValue.trim() !== "" &&
    urlValue.trim() !== "" &&
    hasTextContent(contentHtml);

  // Only block navigations that leave this page — not form submissions to the
  // same route. Suppressed once a save succeeds so navigate() passes through.
  const shouldBlock: BlockerFunction = ({ currentLocation, nextLocation }) =>
    isDirty &&
    !actionData?.ok &&
    currentLocation.pathname !== nextLocation.pathname;
  const blocker = useBlocker(shouldBlock);

  function handleFormInput(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const titleEl = form.elements.namedItem("title") as HTMLInputElement | null;
    const urlEl = form.elements.namedItem("url") as HTMLInputElement | null;
    if (titleEl) setTitleValue(titleEl.value);
    if (urlEl) setUrlValue(urlEl.value);
    setIsDirty(true);
  }

  function handleContentChange(html: string) {
    setContentHtml(html);
    setIsDirty(true);
  }

  function handleSitesChange(rkeys: string[]) {
    setSelectedSites(rkeys);
    setIsDirty(true);
  }

  function handleTagsChange(_tags: string[]) {
    setIsDirty(true);
  }

  function handleSplashImageChange(_url: string) {
    setIsDirty(true);
  }

  useEffect(() => {
    if (!actionData?.ok) return;
    addToast({
      heading: "Article saved",
      content: actionData.title,
      variant: "success",
    });
    if ("coverImageWarning" in actionData && actionData.coverImageWarning) {
      addToast({
        heading: "Cover image upload failed",
        content: actionData.coverImageWarning,
        variant: "danger",
        autoExpire: false,
      });
    }
    if ("newSlug" in actionData && actionData.newSlug) {
      navigate(`/article/edit/${actionData.newSlug}`, { replace: true });
    } else {
      setIsDirty(false);
      if ("newCid" in actionData && actionData.newCid)
        setCidValue(actionData.newCid);
    }
  }, [actionData]);

  return (
    <Form method="post" id="edit-article-form" onInput={handleFormInput}>
      <input type="hidden" name="rkey" value={rkey} />
      <input type="hidden" name="cid" value={cidValue ?? ""} />
      <input type="hidden" name="createdAt" value={createdAt} />
      <input
        type="hidden"
        name="oldSiteRkeys"
        value={JSON.stringify(currentSiteRkeys)}
      />
      <input type="hidden" name="publishedSite" value={publishedSite} />
      <input type="hidden" name="publishedAt" value={publishedAt} />
      <input type="hidden" name="publishedPath" value={publishedPath} />
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Document}>
            Edit Article
          </PageContainerHeading>
        }
        fixed
      >
        <ArticleForm
          defaultTitle={title}
          defaultUrl={slug}
          defaultSplashImageUrl={splashImageUrl}
          defaultDescription={description}
          defaultTags={tags}
          defaultContent={content}
          onTagsChange={handleTagsChange}
          onSplashImageUrlChange={handleSplashImageChange}
          sites={sites}
          selectedSites={selectedSites}
          onSitesChange={handleSitesChange}
          onContentChange={handleContentChange}
          error={actionData?.error}
          urlWarning={
            slugChanged
              ? "Changing this slug will break existing links to this article."
              : undefined
          }
          columnar
        />
      </PageContainer>

      <FooterPortal>
        {!canSave && (
          <SaveChecklist
            title={titleValue.trim() !== ""}
            urlSlug={urlValue.trim() !== ""}
            content={hasTextContent(contentHtml)}
          />
        )}
        <Button
          form="edit-article-form"
          type="submit"
          variant="success"
          disabled={!isDirty || !canSave}
        >
          {isDirty ? "Save Changes" : "No Changes"}
        </Button>
      </FooterPortal>

      <Modal
        isOpen={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Unsaved changes"
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard & Leave
            </Button>
          </>
        }
      >
        <p>
          You have unsaved changes that will be lost if you leave this page.
        </p>
      </Modal>
    </Form>
  );
}
