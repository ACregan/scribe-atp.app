import type { Route } from "./+types/edit";
import { Form, redirect } from "react-router";
import { RichTextEditor } from "~/components/RichTextEditor/RichTextEditor";
import { Input } from "~/components/Input/Input";
import { Select } from "~/components/Select/Select";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";
import { useState } from "react";

import { ARTICLE_COLLECTION, SITE_COLLECTION, SLUG_RE } from "~/constants";

type SiteOption = { rkey: string; title: string; url: string };

type ArticleRef = {
  uri: string;
  title: string;
  splashImageUrl: string | null;
  createdAt: string;
};

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
      articles: (g.articles ?? []).map((a) =>
        a.uri === oldUri ? newRef : a,
      ),
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
  const cid = formData.get("cid") as string | null;
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

  const record = {
    $type: ARTICLE_COLLECTION,
    title,
    content,
    url: newUrl,
    splashImageUrl: splashImageUrl?.trim() || undefined,
    createdAt: new Date().toISOString(),
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
        err instanceof Error ? err.message : "Failed to save. Please try again.",
    };
  }

  // Update site assignments
  const sitesToAdd = newSiteRkeys.filter((r) => !oldSiteRkeys.includes(r));
  const sitesToRemove = oldSiteRkeys.filter((r) => !newSiteRkeys.includes(r));
  const sitesToUpdate = oldSiteRkeys.filter(
    (r) => newSiteRkeys.includes(r) && slugChanged,
  );

  const newArticleRef: ArticleRef = {
    uri: newArticleUri,
    title,
    splashImageUrl: splashImageUrl?.trim() || null,
    createdAt: new Date().toISOString(),
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

  return redirect("/article/list");
}

export default function EditArticle({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { title, content, url, splashImageUrl, cid, sites, currentSiteRkeys } =
    loaderData;

  const [selectedSites, setSelectedSites] = useState<string[]>(
    currentSiteRkeys,
  );

  const siteOptions = sites.map((s) => ({
    value: s.rkey,
    label: `${s.title} (${s.url})`,
  }));

  return (
    <div>
      <h1>Edit Article</h1>
      <Form method="post">
        <input type="hidden" name="cid" value={cid ?? ""} />
        <input
          type="hidden"
          name="oldSiteRkeys"
          value={JSON.stringify(currentSiteRkeys)}
        />
        <div>
          <label htmlFor="title">Title</label>
          <input type="text" id="title" name="title" defaultValue={title} />
        </div>
        <div>
          <label htmlFor="url">URL slug</label>
          <input type="text" id="url" name="url" defaultValue={url} />
        </div>
        <div>
          <label htmlFor="splashImageUrl">Splash image URL</label>
          <input
            type="text"
            id="splashImageUrl"
            name="splashImageUrl"
            defaultValue={splashImageUrl}
          />
        </div>

        {siteOptions.length > 0 && (
          <Select
            name="sites"
            label="Assign to sites"
            options={siteOptions}
            multiple
            value={selectedSites}
            onChange={setSelectedSites}
          />
        )}

        <RichTextEditor name="content" label="Content" defaultValue={content} />
        <button type="submit">Save changes</button>
      </Form>
      {actionData?.error && (
        <p style={{ color: "red" }}>{actionData.error}</p>
      )}
    </div>
  );
}
