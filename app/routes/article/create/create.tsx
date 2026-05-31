import type { Route } from "./+types/create";
import { Form } from "react-router";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
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

  const siteOptions = sites.map((s) => ({
    value: s.rkey,
    label: `${s.title} (${s.url})`,
  }));

  return (
    <Form method="post">
      <PageContainer
        title="Create Article"
        bottomButtons={<button type="submit">Save to PDS</button>}
      >
        <PageSection>
          <Input id="title" name="title" label="Title" />
          <Input
            id="url"
            name="url"
            label="URL slug"
            placeholder="my-article-title"
          />
          <Input
            id="splashImageUrl"
            name="splashImageUrl"
            label="Splash image URL"
          />
        </PageSection>

        {siteOptions.length > 0 && (
          <PageSection>
            <Select
              name="sites"
              label="Assign to sites"
              options={siteOptions}
              multiple
              value={selectedSites}
              onChange={setSelectedSites}
            />
          </PageSection>
        )}

        <PageSection>
          <RichTextEditor name="content" label="Content" />
        </PageSection>

        {actionData?.uri && (
          <PageSection>
            <p>
              {actionData.devMode
                ? `[Dev] "${actionData.title}" would be saved at: ${actionData.uri}`
                : `"${actionData.title}" saved — AT URI: ${actionData.uri}`}
            </p>
          </PageSection>
        )}
        {actionData?.error && (
          <PageSection>
            <p style={{ color: "red" }}>{actionData.error}</p>
          </PageSection>
        )}
      </PageContainer>
    </Form>
  );
}
