import type { Route } from "./+types/create";
import { Form } from "react-router";
import { PageContainer } from "~/components/PageContainer/PageContainer";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { useState, useEffect } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION, SITE_COLLECTION, SLUG_RE } from "~/constants";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { Button } from "~/components/Button/Button";
import { ArticleForm, type SiteOption } from "~/components/ArticleForm/ArticleForm";

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      sites: [
        { rkey: "norobots-blog", title: "NoRobots.blog", url: "norobots.blog" },
        {
          rkey: "perpetualsummer-ltd",
          title: "Perpetual Summer LTD",
          url: "perpetualsummer.ltd",
        },
      ] as SiteOption[],
    };
  }

  const agent = await getAtpAgent(did);
  const sitesResult = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SITE_COLLECTION,
    limit: 100,
  });

  return {
    sites: sitesResult.data.records.map((record) => ({
      rkey: record.uri.split("/").pop()!,
      title: String((record.value as Record<string, unknown>).title ?? ""),
      url: String((record.value as Record<string, unknown>).url ?? ""),
    })) as SiteOption[],
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const url = formData.get("url") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;
  const selectedSiteRkeys = formData.getAll("sites") as string[];

  if (!title?.trim()) return { error: "Title is required." };
  if (!url?.trim()) return { error: "URL slug is required." };
  if (!SLUG_RE.test(url))
    return {
      error:
        "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).",
    };

  if (!useRealOAuth) {
    return {
      uri: `at://${did}/${ARTICLE_COLLECTION}/${url}`,
      devMode: true,
      title,
    };
  }

  try {
    const agent = await getAtpAgent(did);
    const result = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey: url,
      record: {
        $type: ARTICLE_COLLECTION,
        title,
        content,
        url,
        splashImageUrl: splashImageUrl?.trim() || undefined,
        createdAt: new Date().toISOString(),
      },
    });

    if (selectedSiteRkeys.length > 0) {
      const articleRef = {
        uri: result.data.uri,
        title,
        splashImageUrl: splashImageUrl?.trim() || null,
        createdAt: new Date().toISOString(),
      };

      await Promise.allSettled(
        selectedSiteRkeys.map(async (siteRkey) => {
          const siteRecord = await agent.com.atproto.repo.getRecord({
            repo: did,
            collection: SITE_COLLECTION,
            rkey: siteRkey,
          });
          const siteValue = siteRecord.data.value as Record<string, unknown>;
          await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: SITE_COLLECTION,
            rkey: siteRkey,
            record: {
              ...siteValue,
              articles: [
                ...((siteValue.articles as unknown[]) ?? []),
                articleRef,
              ],
              updatedAt: new Date().toISOString(),
            },
            swapRecord: siteRecord.data.cid,
          });
        }),
      );
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
  const { sites } = loaderData;
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
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
      <PageContainer title="Create Article">
        <ArticleForm
          sites={sites}
          selectedSites={selectedSites}
          onSitesChange={setSelectedSites}
          error={actionData?.error}
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
