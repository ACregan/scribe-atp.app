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
import {
  getAtpAgent,
  requireAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";
import {
  validateArticleFields,
  createArticle,
  loadSiteOptions,
} from "~/services/article.server";
import { toSlug } from "~/hooks/utils";
import { hasTextContent } from "~/components/utils";
import { devCreateLoader } from "~/services/devFixtures.server";
import { useState, useEffect, useRef } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION } from "~/constants";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
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
  const { did } = await requireAuth(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const url = formData.get("url") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;
  const synopsis = formData.get("synopsis") as string;
  const selectedSiteRkeys = formData.getAll("sites") as string[];

  const validationError = validateArticleFields(title, url);
  if (validationError) return { error: validationError };

  if (!useRealOAuth) {
    return {
      uri: `at://${did}/${ARTICLE_COLLECTION}/${url}`,
      devMode: true,
      title,
    };
  }

  try {
    const agent = await getAtpAgent(did);
    const { uri } = await createArticle(
      agent,
      did,
      { title, content, url, splashImageUrl, synopsis },
      selectedSiteRkeys,
    );
    return { uri, devMode: false, title };
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
    !actionData?.uri &&
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

  useEffect(() => {
    if (!actionData?.uri) return;
    addToast({
      heading: actionData.devMode ? "Dev — article not saved" : "Article saved",
      content: actionData.title,
      variant: "primary",
    });
    if (!actionData.devMode) {
      const slug = actionData.uri.split("/").pop()!;
      navigate(`/article/edit/${slug}`);
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
          sites={sites}
          selectedSites={selectedSites}
          onSitesChange={handleSitesChange}
          onContentChange={handleContentChange}
          error={actionData?.error}
          columnar
        />
      </PageContainer>

      <FooterPortal>
        <Button form="create-article-form" type="submit" disabled={!canSave}>
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
