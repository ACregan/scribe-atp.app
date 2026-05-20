import type { Route } from "./+types/create";
import { Form } from "react-router";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { RichTextEditor } from "~/components/RichTextEditor/RichTextEditor";
import { Input } from "~/components/Input/Input";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";

const COLLECTION = "app.scribe.article";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const url = formData.get("url") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;

  if (!title?.trim()) return { error: "Title is required." };
  if (!url?.trim()) return { error: "URL slug is required." };
  if (!SLUG_RE.test(url))
    return {
      error:
        "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).",
    };

  if (!useRealOAuth) {
    return {
      uri: `at://${did}/${COLLECTION}/${url}`,
      devMode: true,
      title,
    };
  }

  try {
    const agent = await getAtpAgent(did);
    const result = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: COLLECTION,
      rkey: url,
      record: {
        $type: COLLECTION,
        title,
        content,
        url,
        splashImageUrl: splashImageUrl?.trim() || undefined,
        createdAt: new Date().toISOString(),
      },
    });
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

export default function Create({ actionData }: Route.ComponentProps) {
  return (
    <Form method="post">
      <PageContainer
        title="Create Article"
        bottomButtons={<button type="submit">Save to PDS</button>}
      >
        <PageSection>
          <Input id="title" name="title" label="Title" />
          <Input id="url" name="url" label="URL slug" placeholder="my-article-title" />
          <Input id="splashImageUrl" name="splashImageUrl" label="Splash image URL" />
        </PageSection>

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
