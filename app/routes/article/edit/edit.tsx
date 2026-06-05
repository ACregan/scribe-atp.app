import type { Route } from "./+types/edit";
import { Form, redirect, useNavigate } from "react-router";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { useState, useEffect } from "react";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION, SITE_COLLECTION, SLUG_RE } from "~/constants";
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

import { type ArticleRef } from "~/hooks/types";

type SiteRecord = {
  articles: ArticleRef[];
  groups: Array<{ articles: ArticleRef[] } & Record<string, unknown>>;
} & Record<string, unknown>;

function removeArticleFromSiteValue(
  siteValue: SiteRecord,
  articleUri: string,
): SiteRecord {
  return {
    ...siteValue,
    articles: (siteValue.articles ?? []).filter((a) => a.uri !== articleUri),
    groups: (siteValue.groups ?? []).map((g) => ({
      ...g,
      articles: (g.articles ?? []).filter((a) => a.uri !== articleUri),
    })),
    updatedAt: new Date().toISOString(),
  };
}

function updateArticleUriInSiteValue(
  siteValue: SiteRecord,
  oldUri: string,
  newRef: ArticleRef,
): SiteRecord {
  return {
    ...siteValue,
    articles: (siteValue.articles ?? []).map((a) =>
      a.uri === oldUri ? newRef : a,
    ),
    groups: (siteValue.groups ?? []).map((g) => ({
      ...g,
      articles: (g.articles ?? []).map((a) => (a.uri === oldUri ? newRef : a)),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Edit Article" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

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

  const agent = await getAtpAgent(did);
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

  const sites: SiteOption[] = sitesResult.data.records.map((record) => ({
    rkey: record.uri.split("/").pop()!,
    title: String((record.value as Record<string, unknown>).title ?? ""),
    url: String((record.value as Record<string, unknown>).url ?? ""),
  }));

  const currentSiteRkeys = sitesResult.data.records
    .filter((record) => {
      const value = record.value as SiteRecord;
      const inTopLevel = (value.articles ?? []).some(
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
    createdAt: String(articleResult.data.value.createdAt ?? new Date().toISOString()),
    cid: articleResult.data.cid ?? null,
    sites,
    currentSiteRkeys,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { did } = await requireAuth(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const newUrl = formData.get("url") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;
  const synopsis = formData.get("synopsis") as string;
  const cid = formData.get("cid") as string | null;
  const createdAt = (formData.get("createdAt") as string) || new Date().toISOString();
  const oldRkey = params.articleUrl;
  const newSiteRkeys = formData.getAll("sites") as string[];
  const oldSiteRkeys: string[] = JSON.parse(
    (formData.get("oldSiteRkeys") as string) || "[]",
  );

  if (!title?.trim()) return { error: "Title is required." };
  if (!newUrl?.trim()) return { error: "URL slug is required." };
  if (!SLUG_RE.test(newUrl))
    return {
      error:
        "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).",
    };

  if (!useRealOAuth) return redirect("/article/list");

  const agent = await getAtpAgent(did);
  const oldArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${oldRkey}`;
  const newArticleUri = `at://${did}/${ARTICLE_COLLECTION}/${newUrl}`;
  const slugChanged = newUrl !== oldRkey;

  const now = new Date().toISOString();
  const record = {
    $type: ARTICLE_COLLECTION,
    title,
    content,
    url: newUrl,
    splashImageUrl: splashImageUrl?.trim() || undefined,
    synopsis: synopsis?.trim() || undefined,
    createdAt,
    updatedAt: now,
  };

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

  const newArticleRef: ArticleRef = {
    uri: newArticleUri,
    title,
    url: newUrl,
    splashImageUrl: splashImageUrl?.trim() || null,
    synopsis: synopsis?.trim() || null,
    createdAt,
    updatedAt: now,
  };

  await Promise.allSettled([
    ...sitesToRemove.map(async (siteRkey) => {
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
      });
      const updated = removeArticleFromSiteValue(
        rec.data.value as SiteRecord,
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
      const updated = updateArticleUriInSiteValue(
        rec.data.value as SiteRecord,
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
      const updated = updateArticleUriInSiteValue(
        rec.data.value as SiteRecord,
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

    ...sitesToAdd.map(async (siteRkey) => {
      const rec = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
      });
      const siteValue = rec.data.value as SiteRecord;
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteRkey,
        record: {
          ...siteValue,
          articles: [...(siteValue.articles ?? []), newArticleRef],
          updatedAt: new Date().toISOString(),
        },
        swapRecord: rec.data.cid,
      });
    }),
  ]);

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
