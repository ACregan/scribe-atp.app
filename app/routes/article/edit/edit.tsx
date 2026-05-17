import type { Route } from "./+types/edit";
import { Form, redirect } from "react-router";
import {
  getAtpAgent,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";

const COLLECTION = "app.scribe.article";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Edit Article" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { did, isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated || !did) return redirect("/login");

  if (!useRealOAuth) {
    return {
      rkey: params.rkey,
      title: "Dev mode article",
      content: "Dev mode content",
      url: params.rkey,
      splashImageUrl: "",
      cid: "dev-cid",
    };
  }

  const agent = await getAtpAgent(did);
  const result = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: COLLECTION,
    rkey: params.rkey,
  });

  return {
    rkey: params.rkey,
    title: String(result.data.value.title ?? ""),
    content: String(result.data.value.content ?? ""),
    url: String(result.data.value.url ?? params.rkey),
    splashImageUrl: String(result.data.value.splashImageUrl ?? ""),
    cid: result.data.cid ?? null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { did, isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated || !did) return redirect("/login");

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const splashImageUrl = formData.get("splashImageUrl") as string;
  const cid = formData.get("cid") as string | null;

  if (!title?.trim()) return { error: "Title is required." };

  if (!useRealOAuth) return redirect("/article/list");

  try {
    const agent = await getAtpAgent(did);
    await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: COLLECTION,
      rkey: params.rkey,
      record: {
        $type: COLLECTION,
        title,
        content,
        url: params.rkey,
        splashImageUrl: splashImageUrl?.trim() || undefined,
        createdAt: new Date().toISOString(),
      },
      swapRecord: cid ?? undefined,
    });
    return redirect("/article/list");
  } catch (err) {
    console.error("Failed to update article:", err);
    return {
      error:
        err instanceof Error ? err.message : "Failed to save. Please try again.",
    };
  }
}

export default function EditArticle({ loaderData, actionData }: Route.ComponentProps) {
  const { title, content, url, splashImageUrl, cid } = loaderData;

  return (
    <div>
      <h1>Edit Article</h1>
      <Form method="post">
        <input type="hidden" name="cid" value={cid ?? ""} />
        <div>
          <label htmlFor="title">Title</label>
          <input type="text" id="title" name="title" defaultValue={title} />
        </div>
        <div>
          <label htmlFor="url">URL slug</label>
          <input
            type="text"
            id="url"
            name="url"
            value={url}
            readOnly
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          />
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
        <div>
          <label htmlFor="content">Content</label>
          <textarea
            id="content"
            name="content"
            rows={10}
            cols={80}
            defaultValue={content}
          />
        </div>
        <button type="submit">Save changes</button>
      </Form>
      {actionData?.error && (
        <p style={{ color: "red" }}>{actionData.error}</p>
      )}
    </div>
  );
}
