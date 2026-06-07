import type { Route } from "./+types/edit";
import { Form, redirect, useNavigate } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  validateArticleFields,
  buildArticleRecord,
  buildArticleRef,
  addArticleToSites,
} from "~/services/article.server";
import { useState, useEffect } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION, SITE_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageContainerHeading,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import {
  ArticleForm,
  type SiteOption,
} from "~/components/ArticleForm/ArticleForm";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

import {
  removeArticleRef,
  updateArticleRef,
  type SiteRecordValue,
} from "~/routes/article/site-list/siteTree";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Edit Article" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return {
      rkey: params.articleUrl,
      title: "Dev mode article",
      content: "Dev mode content",
      url: params.articleUrl,
      splashImageUrl: "",
      synopsis: "",
      cid: "dev-cid",
      sites: [
        { rkey: "norobots-blog", title: "NoRobots.blog", url: "norobots.blog" },
        {
          rkey: "perpetualsummer-ltd",
          title: "Perpetual Summer LTD",
          url: "perpetualsummer.ltd",
        },
      ] as SiteOption[],
      currentSiteRkeys: [] as string[],
    };
  }

  const { agent, did } = await requireAtpAgent(request);
  const articleUri = `at://${did}/${ARTICLE_COLLECTION}/${params.articleUrl}`;

  const [articleResult, sitesResult] = await Promise.all([
    agent.com.atproto.repo.getRecord({
      repo: did,
      collection: ARTICLE_COLLECTION,
      rkey: params.articleUrl,
    }),
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 100,
    }),
  ]);

  const sites = sitesResult.data.records.map((record) => ({
    rkey: record.uri.split("/").pop()!,
    title: String((record.value as Record<string, unknown>).title ?? ""),
    url: String((record.value as Record<string, unknown>).url ?? ""),
  }));

  const currentSiteRkeys = sitesResult.data.records
    .filter((record) => {
      const value = record.value as SiteRecordValue;
      const inTopLevel = (value.ungroupedArticles ?? []).some(
        (a) => a.uri === articleUri,
      );
      const inGroups = (value.groups ?? []).some((g) =>
        (g.articles ?? []).some((a) => a.uri === articleUri),
      );
      return inTopLevel || inGroups;
    })
    .map((record) => record.uri.split("/").pop()!);

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

  const validationError = validateArticleFields(title, newUrl);
  if (validationError) return { error: validationError };

  if (!useRealOAuth) return redirect("/article/list");

  const { agent, did } = await requireAtpAgent(request);
  const oldArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${oldRkey}`;
  const newArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${newUrl}`;
  const slugChanged = newUrl !== oldRkey;

  const now = new Date().toISOString();
  const record = buildArticleRecord({
    title,
    content,
    url: newUrl,
    splashImageUrl,
    synopsis,
    createdAt,
    updatedAt: now,
  });

  try {
    if (slugChanged) {
      await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: ARTICLE_COLLECTION,
        rkey: newUrl,
        record,
      });
      await agent.com.atproto.repo
        .deleteRecord({
          repo: did,
          collection: ARTICLE_COLLECTION,
          rkey: oldRkey,
          swapRecord: cid ?? undefined,
        })
        .catch((err) => {
          console.error("Failed to delete old record after rename:", err);
        });
    } else {
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: ARTICLE_COLLECTION,
        rkey: oldRkey,
        record,
        swapRecord: cid ?? undefined,
      });
    }
  } catch (err) {
    console.error("Failed to update article:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to save. Please try again.",
    };
  }

  // Update site assignments
  const sitesToAdd = newSiteRkeys.filter((r) => !oldSiteRkeys.includes(r));
  const sitesToRemove = oldSiteRkeys.filter((r) => !newSiteRkeys.includes(r));
  const sitesToUpdate = oldSiteRkeys.filter(
    (r) => newSiteRkeys.includes(r) && slugChanged,
  );
  const sitesToRefresh = oldSiteRkeys.filter(
    (r) => newSiteRkeys.includes(r) && !slugChanged,
  );

  const newArticleRef = buildArticleRef({
    uri: newArticleUri,
    title,
    url: newUrl,
    splashImageUrl,
    synopsis,
    createdAt,
    updatedAt: now,
  });

  await Promise.allSettled([
    ...sitesToRemove.map(async (siteRkey) => {
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
      });
      const updated = removeArticleRef(
        rec.data.value as SiteRecordValue,
        oldArticleUri,
      );
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: updated,
        swapRecord: rec.data.cid,
      });
    }),

    ...sitesToUpdate.map(async (siteRkey) => {
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
      });
      const updated = updateArticleRef(
        rec.data.value as SiteRecordValue,
        oldArticleUri,
        newArticleRef,
      );
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: updated,
        swapRecord: rec.data.cid,
      });
    }),

    ...sitesToRefresh.map(async (siteRkey) => {
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
      });
      const updated = updateArticleRef(
        rec.data.value as SiteRecordValue,
        oldArticleUri,
        newArticleRef,
      );
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: updated,
        swapRecord: rec.data.cid,
      });
    }),
  ]);

  await addArticleToSites(agent, did, sitesToAdd, newArticleRef);

  return { ok: true, title };
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
  const navigate = useNavigate();
  const { addToast } = useToast();

  useEffect(() => {
    if (!actionData?.ok) return;
    addToast({
      heading: "Article saved",
      content: actionData.title,
      variant: "primary",
    });
    navigate("/article/list");
  }, [actionData]);

  return (
    <Form method="post" id="edit-article-form">
      <input type="hidden" name="cid" value={cid ?? ""} />
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
          onSitesChange={setSelectedSites}
          error={actionData?.error}
          columnar
        />
      </PageContainer>

      <FooterPortal>
        <Button form="edit-article-form" type="submit">
          Save Changes
        </Button>
      </FooterPortal>
    </Form>
  );
}
