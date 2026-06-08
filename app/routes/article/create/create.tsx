import type { Route } from "./+types/create";
import { Form } from "react-router";
import {
  PageContainer,
  PageContainerHeading,
} from "~/components/PageContainer/PageContainer";
import {
  getAtpAgent,
  requireAuth,
  requireAtpAgent,
  useRealOAuth,
} from "~/services/auth.server";
import {
  validateArticleFields,
  buildArticleRecord,
  buildArticleRef,
  loadSiteOptions,
} from "~/services/article.server";
import { addArticleToSites } from "~/services/articleSiteSync.server";
import { useState, useEffect } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION } from "~/constants";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { Button } from "~/components/Button/Button";
import {
  ArticleForm,
  type SiteOption,
} from "~/components/ArticleForm/ArticleForm";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

export async function loader({ request }: Route.LoaderArgs) {
  const preselect = new URL(request.url).searchParams.get("site") ?? undefined;

  if (!useRealOAuth) {
    const sites: SiteOption[] = [
      { rkey: "norobots-blog", title: "NoRobots.blog", url: "norobots.blog" },
      {
        rkey: "perpetualsummer-ltd",
        title: "Perpetual Summer LTD",
        url: "perpetualsummer.ltd",
      },
    ];
    const preselectedSite = sites.some((s) => s.rkey === preselect)
      ? preselect
      : undefined;
    return { sites, preselectedSite };
  }

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
    const now = new Date().toISOString();
    const result = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey: url,
      record: buildArticleRecord({
        title,
        content,
        url,
        splashImageUrl,
        synopsis,
        createdAt: now,
        updatedAt: now,
      }),
    });

    if (selectedSiteRkeys.length > 0) {
      const articleRef = buildArticleRef({
        uri: result.data.uri,
        title,
        url,
        splashImageUrl,
        synopsis,
        createdAt: now,
        updatedAt: now,
      });
      await addArticleToSites(agent, did, selectedSiteRkeys, articleRef);
    }

    return { uri: result.data.uri, devMode: false, title };
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
  const { addToast } = useToast();

  useEffect(() => {
    if (!actionData?.uri) return;
    addToast({
      heading: actionData.devMode ? "Dev — article not saved" : "Article saved",
      content: actionData.title,
      variant: "primary",
    });
  }, [actionData]);

  return (
    <Form method="post" id="create-article-form">
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Document}>
            Create Article
          </PageContainerHeading>
        }
        fixed
      >
        <ArticleForm
          sites={sites}
          selectedSites={selectedSites}
          onSitesChange={setSelectedSites}
          error={actionData?.error}
          columnar
        />
      </PageContainer>

      <FooterPortal>
        <Button form="create-article-form" type="submit">
          Save to PDS
        </Button>
      </FooterPortal>
    </Form>
  );
}
