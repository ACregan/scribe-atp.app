import type { Route } from "./+types/create";
import { Form } from "react-router";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";

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
    <div>
      <h1>Create Article</h1>
      <Form method="post">
        <div>
          <label htmlFor="title">Title</label>
          <input type="text" id="title" name="title" />
        </div>
        <div>
          <label htmlFor="url">URL slug</label>
          <input
            type="text"
            id="url"
            name="url"
            placeholder="my-article-title"
          />
        </div>
        <div>
          <label htmlFor="splashImageUrl">Splash image URL</label>
          <input type="text" id="splashImageUrl" name="splashImageUrl" />
        </div>
        <div>
          <label htmlFor="content">Content</label>
          <textarea id="content" name="content" rows={10} cols={80} />
        </div>
        <button type="submit">Save to PDS</button>
      </Form>

      {actionData?.uri && (
        <p>
          {actionData.devMode
            ? `[Dev] "${actionData.title}" would be saved at: ${actionData.uri}`
            : `"${actionData.title}" saved — AT URI: ${actionData.uri}`}
        </p>
      )}
      {actionData?.error && (
        <p style={{ color: "red" }}>{actionData.error}</p>
      )}
    </div>
  );
}
