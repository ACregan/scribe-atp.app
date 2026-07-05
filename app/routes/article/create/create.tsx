import type { Route } from "./+types/create";
import {
  Form,
  useNavigate,
  useBlocker,
  type BlockerFunction,
} from "react-router";
import {
  PageContainer,
  PageContainerHeading,
} from "~/components/PageContainer/PageContainer";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  validateArticleFields,
  buildArticleRef,
  loadSiteOptions,
} from "~/services/article.server";
import { addArticleToSites } from "~/services/articleSiteSync.server";
import { createDocument } from "~/services/documentRepository.server";
import { toSlug } from "~/hooks/utils";
import { hasTextContent } from "~/components/utils";
import { devCreateLoader } from "~/services/devFixtures.server";
import { useState, useEffect, useRef } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { SaveChecklist } from "~/components/SaveChecklist/SaveChecklist";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import {
  ArticleForm,
  type SiteOption,
} from "~/components/ArticleForm/ArticleForm";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

export async function loader({ request }: Route.LoaderArgs) {
  const preselect = new URL(request.url).searchParams.get("site") ?? undefined;

  if (!useRealOAuth) return devCreateLoader(preselect);

  const { agent, did } = await requireAtpAgent(request);
  const sites = await loadSiteOptions(agent, did);
  const preselectedSite = sites.some((s) => s.rkey === preselect)
    ? preselect
    : undefined;

  return { sites, preselectedSite };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const slug = formData.get("url") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;
  const description = formData.get("description") as string;
  const selectedSiteRkeys = formData.getAll("sites") as string[];
  const tags = formData.getAll("tags") as string[];

  const validationError = validateArticleFields(title, slug, splashImageUrl);
  if (validationError) return { error: validationError };

  if (!useRealOAuth) {
    return { slug, devMode: true as const, title };
  }

  try {
    const { agent, did } = await requireAtpAgent(request);
    const now = new Date().toISOString();

    // Resolve the primary site's domain for scribe.domain
    let siteDomain = "";
    const primarySiteRkey = selectedSiteRkeys[0] ?? "";
    if (primarySiteRkey) {
      try {
        const siteRecord = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: SITE_COLLECTION,
          rkey: primarySiteRkey,
        });
        const scribe = (siteRecord.data.value as Record<string, unknown>)
          .scribe as Record<string, unknown>;
        siteDomain = String(scribe?.domain ?? "");
      } catch {
        // non-fatal
      }
    }
    const siteAtUri = primarySiteRkey
      ? `at://${did}/${SITE_COLLECTION}/${primarySiteRkey}`
      : "";

    const textContent = content
      ? content
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : undefined;

    // Create site.standard.document — PDS generates TID rkey; no manifest entry = draft
    const createResult = await createDocument(agent, did, {
      $type: DOCUMENT_COLLECTION,
      title,
      content: { $type: "app.scribe.content.html", html: content },
      textContent: textContent || undefined,
      description: description?.trim() || undefined,
      tags: tags.length ? tags : undefined,
      path: `/${slug}`,
      site: siteAtUri,
      updatedAt: now,
      scribe: {
        coverImageUrl: splashImageUrl?.trim() || undefined,
        createdAt: now,
        domain: siteDomain || undefined,
      },
    });

    // Add to selected sites' ungroupedArticles so user can publish from site-list
    if (selectedSiteRkeys.length > 0) {
      const ref = buildArticleRef({
        uri: createResult.uri,
        title,
        slug,
        splashImageUrl,
        description,
        tags: tags.length ? tags : undefined,
        createdAt: now,
        updatedAt: now,
      });
      await addArticleToSites(agent, did, selectedSiteRkeys, ref);
    }

    return { slug, devMode: false as const, title };
  } catch (err) {
    console.error("Failed to write article to PDS:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to save article. Please try again.",
    };
  }
}

export default function Create({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { sites, preselectedSite } = loaderData;
  const [selectedSites, setSelectedSites] = useState<string[]>(
    preselectedSite ? [preselectedSite] : [],
  );
  const [isDirty, setIsDirty] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const slugDirtyRef = useRef(false);
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
    !actionData?.slug &&
    currentLocation.pathname !== nextLocation.pathname;
  const blocker = useBlocker(shouldBlock);

  function handleFormInput() {
    setIsDirty(true);
  }

  function handleTitleChange(value: string) {
    setTitleValue(value);
    if (!slugDirtyRef.current) setUrlValue(toSlug(value));
    setIsDirty(true);
  }

  function handleUrlChange(value: string) {
    slugDirtyRef.current = true;
    setUrlValue(value.toLowerCase());
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
    if (!actionData?.slug) return;
    addToast({
      heading: actionData.devMode ? "Dev — article not saved" : "Article saved",
      content: actionData.title,
      variant: actionData.devMode ? "primary" : "success",
    });
    if (!actionData.devMode) {
      navigate(`/article/edit/${actionData.slug}`);
    }
  }, [actionData]);

  return (
    <Form method="post" id="create-article-form" onInput={handleFormInput}>
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Document}>
            Create Article
          </PageContainerHeading>
        }
        fixed
      >
        <ArticleForm
          titleValue={titleValue}
          urlValue={urlValue}
          onTitleChange={handleTitleChange}
          onUrlChange={handleUrlChange}
          onTagsChange={handleTagsChange}
          onSplashImageUrlChange={handleSplashImageChange}
          sites={sites}
          selectedSites={selectedSites}
          onSitesChange={handleSitesChange}
          onContentChange={handleContentChange}
          error={actionData?.error}
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
          form="create-article-form"
          type="submit"
          variant="success"
          disabled={!canSave}
        >
          Save to PDS
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
