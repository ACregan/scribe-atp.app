import type { Route } from "./+types/list";
import { Link, redirect } from "react-router";
import {
  getAtpAgent,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";

const COLLECTION = "app.scribe.article";

type Article = {
  uri: string;
  cid: string;
  title: string;
  createdAt: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP – Articles" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did, isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated || !did) return redirect("/login");

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
            <Link to={`/article/edit/${article.uri.split("/").pop()}`}>Edit</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
