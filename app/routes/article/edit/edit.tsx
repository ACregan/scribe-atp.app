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
  loadSiteOptions,
} from "~/services/article.server";
import { findSitesContaining } from "~/services/articleSiteSync.server";
import { hasTextContent } from "~/components/utils";
import { devEditLoader } from "~/services/devFixtures.server";
import { useState, useEffect, useRef } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION } from "~/constants";
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
  const articleUri = `at://${did}/${ARTICLE_COLLECTION}/${params.articleUrl}`;

  const [articleResult, sites, currentSiteRkeys] = await Promise.all([
    agent.com.atproto.repo.getRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey: params.articleUrl,
    }),
    loadSiteOptions(agent, did),
    findSitesContaining(agent, did, articleUri),
  ]);

  return {
    rkey: params.articleUrl,
    title: String(articleResult.data.value.title ?? ""),
    content: String(articleResult.data.value.content ?? ""),
    url: String(articleResult.data.value.url ?? params.articleUrl),
    splashImageUrl: String(articleResult.data.value.splashImageUrl ?? ""),
    synopsis: String(articleResult.data.value.synopsis ?? ""),
    createdAt: String(
      articleResult.data.value.createdAt ?? new Date().toISOString(),
    ),
    cid: articleResult.data.cid ?? null,
    sites,
    currentSiteRkeys,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const newUrl = formData.get("url") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;
  const synopsis = formData.get("synopsis") as string;
  const cid = formData.get("cid") as string | null;
  const createdAt =
    (formData.get("createdAt") as string) || new Date().toISOString();
  const oldRkey = params.articleUrl;
  const newSiteRkeys = formData.getAll("sites") as string[];
  const oldSiteRkeys: string[] = JSON.parse(
    (formData.get("oldSiteRkeys") as string) || "[]",
  );

  const validationError = validateArticleFields(title, newUrl, splashImageUrl);
  if (validationError) return { ok: false as const, error: validationError };

  if (!useRealOAuth) return { ok: true as const, title };

  try {
    const { agent, did } = await requireAtpAgent(request);
    const result = await updateArticle(agent, did, {
      oldRkey,
      fields: { title, content, url: newUrl, splashImageUrl, synopsis, createdAt },
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
    url,
    splashImageUrl,
    synopsis,
    createdAt,
    cid,
    sites,
    currentSiteRkeys,
  } = loaderData;

  const [selectedSites, setSelectedSites] =
    useState<string[]>(currentSiteRkeys);
  const [isDirty, setIsDirty] = useState(false);
  // Initialise from loader data so canSave is correct before the user edits.
  const [titleValue, setTitleValue] = useState(title);
  const [urlValue, setUrlValue] = useState(url);
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

  useEffect(() => {
    if (!actionData?.ok) return;
    addToast({
      heading: "Article saved",
      content: actionData.title,
      variant: "primary",
    });
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
          defaultUrl={url}
          defaultSplashImageUrl={splashImageUrl}
          defaultSynopsis={synopsis}
          defaultContent={content}
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
