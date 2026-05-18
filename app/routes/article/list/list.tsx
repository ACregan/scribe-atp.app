import type { Route } from "./+types/list";
import { Form, Link, redirect } from "react-router";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";
import { Button } from "~/components/Button/Button";

const COLLECTION = "app.scribe.article";

type Article = {
  uri: string;
  cid: string;
  title: string;
  url: string;
  splashImageUrl: string;
  createdAt: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Articles" }];
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const formData = await request.formData();
  const rkey = formData.get("rkey") as string;
  const cid = formData.get("cid") as string | null;

  if (!rkey) return redirect("/article/list");

  if (useRealOAuth) {
    const agent = await getAtpAgent(did);
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: COLLECTION,
      rkey,
      swapRecord: cid ?? undefined,
    });
  }

  return redirect("/article/list");
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return { articles: [] as Article[], devMode: true };
  }

  try {
    const agent = await getAtpAgent(did);
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: COLLECTION,
      limit: 100,
    });

    const articles: Article[] = result.data.records.map((record) => ({
      uri: record.uri,
      cid: record.cid,
      title: String(record.value.title ?? "(untitled)"),
      url: String(record.value.url ?? record.uri.split("/").pop() ?? ""),
      splashImageUrl: String(record.value.splashImageUrl ?? ""),
      createdAt: String(record.value.createdAt ?? ""),
    }));

    return { articles, devMode: false };
  } catch (err) {
    console.error("Failed to fetch articles from PDS:", err);
    return { articles: [] as Article[], devMode: false, error: String(err) };
  }
}

export default function ArticleList({ loaderData }: Route.ComponentProps) {
  const { articles, devMode, error } = loaderData;

  return (
    <div>
      <h1>Articles</h1>
      <Link to="/article/create">New article</Link>

      {devMode && (
        <p style={{ color: "orange" }}>
          Dev mode: no real PDS connected. Save an article in production to see
          it here.
        </p>
      )}

      {error && <p style={{ color: "red" }}>Error loading articles: {error}</p>}

      {articles.length === 0 && !devMode && !error && (
        <p>
          No articles yet. <Link to="/article/create">Create one.</Link>
        </p>
      )}

      <ul>
        {articles.map((article) => (
          <li key={article.uri}>
            <strong>{article.title}</strong>
            {article.createdAt && (
              <> — {new Date(article.createdAt).toLocaleDateString()}</>
            )}
            <br />
            <small style={{ fontFamily: "monospace" }}>{article.uri}</small>
            <Link to={`/article/view/${article.uri.split("/").pop()}`}>View</Link>
            {" · "}
            <Link to={`/article/edit/${article.uri.split("/").pop()}`}>Edit</Link>
            {" · "}
            <Form
              method="post"
              style={{ display: "inline" }}
              onSubmit={(e) => {
                if (!confirm(`Delete "${article.title}"?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="rkey" value={article.uri.split("/").pop()} />
              <input type="hidden" name="cid" value={article.cid} />
              <Button type="submit" variant="danger">Delete</Button>
            </Form>
          </li>
        ))}
      </ul>
    </div>
  );
}
