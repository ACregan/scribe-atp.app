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
  updateArticle,
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
import { useState, useEffect, useRef } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION, DOCUMENT_COLLECTION } from "~/constants";
import { logger } from "~/services/logger.server";
import {
  PageContainer,
  PageContainerHeading,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
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

  let articleResult: Awaited<
    ReturnType<typeof agent.com.atproto.repo.getRecord>
  >;
  let collection: string;
  try {
    articleResult = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      rkey: params.articleUrl,
    });
    collection = DOCUMENT_COLLECTION;
  } catch {
    articleResult = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey: params.articleUrl,
    });
    collection = ARTICLE_COLLECTION;
  }

  const articleUri = `at://${did}/${collection}/${params.articleUrl}`;
  const [sites, currentSiteRkeys] = await Promise.all([
    siteOptionsPromise,
    findSitesContaining(agent, did, articleUri),
  ]);

  const value = articleResult.data.value as Record<string, unknown>;
  const rawContent = value.content;
  const content =
    typeof rawContent === "object" &&
    rawContent !== null &&
    (rawContent as Record<string, unknown>).$type === "app.scribe.content.html"
      ? String((rawContent as Record<string, unknown>).html ?? "")
      : String(rawContent ?? "");

  return {
    collection,
    rkey: params.articleUrl,
    title: String(value.title ?? ""),
    content,
    slug: params.articleUrl,
    splashImageUrl: String(value.splashImageUrl ?? ""),
    description: String(value.description ?? value.synopsis ?? ""),
    tags: Array.isArray(value.tags) ? (value.tags as string[]) : [],
    createdAt: String(value.createdAt ?? new Date().toISOString()),
    cid: articleResult.data.cid ?? null,
    sites,
    currentSiteRkeys,
    publishedSite:
      collection === DOCUMENT_COLLECTION ? String(value.site ?? "") : null,
    publishedAt:
      collection === DOCUMENT_COLLECTION
        ? String(value.publishedAt ?? "")
        : null,
    publishedPath:
      collection === DOCUMENT_COLLECTION ? String(value.path ?? "") : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
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
  const oldRkey = params.articleUrl;
  const collection =
    (formData.get("collection") as string) || ARTICLE_COLLECTION;
  const oldSiteRkeys: string[] = JSON.parse(
    (formData.get("oldSiteRkeys") as string) || "[]",
  );

  const validationError = validateArticleFields(title, newSlug, splashImageUrl);
  if (validationError) return { ok: false as const, error: validationError };

  if (!useRealOAuth) return { ok: true as const, title };

  if (collection === DOCUMENT_COLLECTION) {
    const publishedSite = (formData.get("publishedSite") as string) || "";
    const publishedAt = (formData.get("publishedAt") as string) || "";
    const publishedPath = (formData.get("publishedPath") as string) || "";

    try {
      const { agent, did } = await requireAtpAgent(request);
      const slugChanged = newSlug !== oldRkey;
      const now = new Date().toISOString();
      const siteChanges = computeSiteAssignmentChanges(
        oldSiteRkeys,
        oldSiteRkeys,
      );

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

      const existingScribe = (existingDoc.scribe as Record<string, unknown>) ?? {};
      const contributors = Array.isArray(existingDoc.contributors)
        ? existingDoc.contributors
        : [];

      // Upload cover image blob — only if URL changed or no cached blob exists
      let coverImageBlobRef: unknown;
      let coverImageUploadFailed = false;
      if (splashImageUrl?.trim()) {
        const existingCoverImageBlob = existingScribe.splashImageBlob;
        const existingSplashImageUrl = String(existingDoc.splashImageUrl ?? "");
        if (existingSplashImageUrl !== splashImageUrl || !existingCoverImageBlob) {
          try {
            const thumbSrc = resolveThumbUrl(splashImageUrl);
            let imgRes = await fetch(thumbSrc);
            if (!imgRes.ok && thumbSrc !== splashImageUrl) {
              imgRes = await fetch(splashImageUrl);
            }
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const mimeType = imgRes.headers.get("content-type") ?? "image/webp";
              const uploadRes = await agent.uploadBlob(new Uint8Array(imgBuffer), {
                encoding: mimeType,
              });
              coverImageBlobRef = uploadRes.data.blob;
            } else {
              coverImageUploadFailed = true;
            }
          } catch (blobErr) {
            logger.warn(
              { event: "article.update.cover_image_blob_error", error: String(blobErr) },
              "cover image blob upload error — save will proceed without coverImage",
            );
            coverImageUploadFailed = true;
          }
        } else {
          coverImageBlobRef = existingCoverImageBlob;
        }
      }

      const updatedRecord = {
        $type: DOCUMENT_COLLECTION,
        title,
        content: { $type: "app.scribe.content.html", html: content },
        splashImageUrl: splashImageUrl?.trim() || undefined,
        ...(coverImageBlobRef !== undefined ? { coverImage: coverImageBlobRef } : {}),
        description: description?.trim() || undefined,
        tags: tags.length ? tags : undefined,
        contributors,
        site: publishedSite,
        publishedAt,
        createdAt,
        updatedAt: now,
        scribe: {
          ...existingScribe,
          ...(coverImageBlobRef !== undefined ? { splashImageBlob: coverImageBlobRef } : {}),
        },
      };

      const coverImageWarning = coverImageUploadFailed
        ? "Cover image could not be uploaded."
        : undefined;

      if (slugChanged) {
        const newPath = publishedPath.replace(/\/[^/]+$/, `/${newSlug}`);
        await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey: newSlug,
          record: { ...updatedRecord, path: newPath },
        });
        await agent.com.atproto.repo
          .deleteRecord({
            repo: did,
            collection: DOCUMENT_COLLECTION,
            rkey: oldRkey,
            swapRecord: cid ?? undefined,
          })
          .catch((err) =>
            console.error("Failed to delete old published record:", err),
          );
        const oldUri = `at://${did}/${DOCUMENT_COLLECTION}/${oldRkey}`;
        const newUri = `at://${did}/${DOCUMENT_COLLECTION}/${newSlug}`;
        const ref = buildArticleRef({
          uri: newUri,
          title,
          slug: newSlug,
          splashImageUrl,
          description,
          tags: tags.length ? tags : undefined,
          publishedAt,
          createdAt,
          updatedAt: now,
        });
        await syncSiteArticleRefs(agent, did, siteChanges, oldUri, ref);
        logger.info(
          {
            event: "article.update",
            user_did: did,
            rkey: newSlug,
            old_rkey: oldRkey,
            slug_renamed: true,
          },
          "article.update",
        );
        return { ok: true as const, title, newSlug, coverImageWarning };
      }

      const putResult = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: DOCUMENT_COLLECTION,
        rkey: oldRkey,
        record: { ...updatedRecord, path: publishedPath },
        swapRecord: cid ?? undefined,
      });
      const uri = `at://${did}/${DOCUMENT_COLLECTION}/${oldRkey}`;
      const ref = buildArticleRef({
        uri,
        title,
        slug: oldRkey,
        splashImageUrl,
        description,
        tags: tags.length ? tags : undefined,
        publishedAt,
        createdAt,
        updatedAt: now,
      });
      await syncSiteArticleRefs(agent, did, siteChanges, uri, ref);
      logger.info(
        { event: "article.update", user_did: did, rkey: oldRkey, slug_renamed: false },
        "article.update",
      );
      return { ok: true as const, title, newCid: putResult.data.cid, coverImageWarning };
    } catch (err) {
      console.error("Failed to update published article:", err);
      return {
        ok: false as const,
        error:
          err instanceof Error
            ? err.message
            : "Failed to save. Please try again.",
      };
    }
  }

  // Draft (ARTICLE_COLLECTION) path
  const newSiteRkeys = formData.getAll("sites") as string[];
  try {
    const { agent, did } = await requireAtpAgent(request);
    const result = await updateArticle(agent, did, {
      oldRkey,
      fields: {
        title,
        content,
        slug: newSlug,
        splashImageUrl,
        description,
        tags,
        createdAt,
      },
      cid,
      oldSiteRkeys,
      newSiteRkeys,
    });
    return { ok: true as const, title, ...result };
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
    collection,
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
    if (actionData.newSlug) {
      navigate(`/article/edit/${actionData.newSlug}`, { replace: true });
    } else {
      setIsDirty(false);
      if (actionData.newCid) setCidValue(actionData.newCid);
    }
  }, [actionData]);

  return (
    <Form method="post" id="edit-article-form" onInput={handleFormInput}>
      <input type="hidden" name="cid" value={cidValue ?? ""} />
      <input type="hidden" name="createdAt" value={createdAt} />
      <input
        type="hidden"
        name="oldSiteRkeys"
        value={JSON.stringify(currentSiteRkeys)}
      />
      <input type="hidden" name="collection" value={collection} />
      {collection === DOCUMENT_COLLECTION && (
        <>
          <input type="hidden" name="publishedSite" value={publishedSite ?? ""} />
          <input type="hidden" name="publishedAt" value={publishedAt ?? ""} />
          <input type="hidden" name="publishedPath" value={publishedPath ?? ""} />
        </>
      )}
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Document}>
            {collection === DOCUMENT_COLLECTION
              ? "Edit Published Article"
              : "Edit Article"}
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
          sites={sites}
          selectedSites={selectedSites}
          onSitesChange={handleSitesChange}
          onContentChange={handleContentChange}
          error={actionData?.error}
          columnar
        />
      </PageContainer>

      <FooterPortal>
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
