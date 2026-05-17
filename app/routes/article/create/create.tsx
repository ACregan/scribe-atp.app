import type { Route } from "./+types/create";
import { Form, redirect } from "react-router";
import {
  getAtpAgent,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";

const COLLECTION = "app.scribe.article";

export async function loader({ request }: Route.LoaderArgs) {
  const { isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated) return redirect("/login");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const { did, isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated || !did) return redirect("/login");

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!title?.trim()) {
    return { error: "Title is required." };
  }

  // In dev-bypass mode there is no real OAuth session, so mock the response.
  if (!useRealOAuth) {
    return {
      uri: `at://${did}/${COLLECTION}/dev-mock`,
      devMode: true,
      title,
    };
  }

  try {
    const agent = await getAtpAgent(did);
    const result = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: COLLECTION,
      record: {
        $type: COLLECTION,
        title,
        content,
        createdAt: new Date().toISOString(),
      },
    });
    return { uri: result.data.uri, devMode: false, title };
  } catch (err) {
    console.error("Failed to write article to PDS:", err);
    return {
      error:
        err instanceof Error ? err.message : "Failed to save article. Please try again.",
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
