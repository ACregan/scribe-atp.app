import type { Route } from "./+types/view";
import { Link } from "react-router";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";

import { ARTICLE_COLLECTION } from "~/constants";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.title ? `${data.title} – Scribe ATP` : "Scribe ATP" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      title: "Dev mode article",
      content: "This is placeholder content for dev mode.",
      splashImageUrl: "",
      createdAt: new Date().toISOString(),
      url: params.articleUrl,
    };
  }

  const agent = await getAtpAgent(did);
  const result = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey: params.articleUrl,
  });

  return {
    title: String(result.data.value.title ?? "(untitled)"),
    content: String(result.data.value.content ?? ""),
    splashImageUrl: String(result.data.value.splashImageUrl ?? ""),
    createdAt: String(result.data.value.createdAt ?? ""),
    url: params.articleUrl,
  };
}

export default function ViewArticle({ loaderData }: Route.ComponentProps) {
  const { title, content, splashImageUrl, createdAt, url } = loaderData;

  return (
    <div>
      {splashImageUrl && (
        <img src={splashImageUrl} alt={title} style={{ maxWidth: "100%", marginBottom: "1rem" }} />
      )}
      <h1>{title}</h1>
      {createdAt && (
        <p style={{ color: "gray", fontSize: "0.875rem" }}>
          {new Date(createdAt).toLocaleDateString()}
        </p>
      )}
      <div dangerouslySetInnerHTML={{ __html: content }} />
      <hr />
      <Link to={`/article/edit/${url}`}>Edit</Link>
      {" · "}
      <Link to="/article/list">Back to articles</Link>
    </div>
  );
}
