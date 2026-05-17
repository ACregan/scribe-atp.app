import type { Route } from "./+types/view";
import { Link } from "react-router";
import {
  getAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";

const COLLECTION = "app.scribe.article";

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
    collection: COLLECTION,
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
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{content}</div>
      <hr />
      <Link to={`/article/edit/${url}`}>Edit</Link>
      {" · "}
      <Link to="/article/list">Back to articles</Link>
    </div>
  );
}
