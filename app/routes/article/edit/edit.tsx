import type { Route } from "./+types/edit";
import { Form, redirect } from "react-router";
import { RichTextEditor } from "~/components/RichTextEditor/RichTextEditor";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";

const COLLECTION = "app.scribe.article";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    };
  }

  const agent = await getAtpAgent(did);
  const result = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: COLLECTION,
    rkey: params.articleUrl,
  });

  return {
    rkey: params.articleUrl,
    title: String(result.data.value.title ?? ""),
    content: String(result.data.value.content ?? ""),
    url: String(result.data.value.url ?? params.articleUrl),
    splashImageUrl: String(result.data.value.splashImageUrl ?? ""),
    cid: result.data.cid ?? null,
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

  if (!title?.trim()) return { error: "Title is required." };
  if (!newUrl?.trim()) return { error: "URL slug is required." };
  if (!SLUG_RE.test(newUrl))
    return {
      error:
        "URL slug must be lowercase letters, numbers, and hyphens only (e.g. my-article).",
    };

  if (!useRealOAuth) return redirect("/article/list");

  const agent = await getAtpAgent(did);
  const record = {
    $type: COLLECTION,
    title,
    content,
    url: newUrl,
    splashImageUrl: splashImageUrl?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  try {
    if (newUrl !== oldRkey) {
      // Slug changed — create at new rkey then delete the old one.
      await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: COLLECTION,
        rkey: newUrl,
        record,
      });
      // Best-effort delete; if this fails the old record is orphaned but the
      // new one is canonical. The user can clean up from the list page.
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: COLLECTION,
        rkey: oldRkey,
        swapRecord: cid ?? undefined,
      }).catch((err) => {
        console.error("Failed to delete old record after rename:", err);
      });
    } else {
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: COLLECTION,
        rkey: oldRkey,
        record,
        swapRecord: cid ?? undefined,
      });
    }
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
            defaultValue={url}
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
        <RichTextEditor name="content" label="Content" defaultValue={content} />
        <button type="submit">Save changes</button>
      </Form>
      {actionData?.error && (
        <p style={{ color: "red" }}>{actionData.error}</p>
      )}
    </div>
  );
}
