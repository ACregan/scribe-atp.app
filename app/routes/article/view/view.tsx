import type { Route } from "./+types/view";
import { Link } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import { devViewLoader } from "~/services/devFixtures.server";
import { Button } from "~/components/Button/Button";
import { ARTICLE_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import FooterPortal from "~/components/FooterPortal/FooterPortal";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.title ? `${data.title} – Scribe ATP` : "Scribe ATP" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!useRealOAuth) return devViewLoader(params.articleUrl);

  const { agent, did } = await requireAtpAgent(request);
  const result = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey: params.articleUrl,
  });

  return {
    title: String(result.data.value.title ?? "(untitled)"),
    content: String(result.data.value.content ?? ""),
    splashImageUrl: String(result.data.value.splashImageUrl ?? ""),
    synopsis: String(result.data.value.synopsis ?? ""),
    createdAt: String(result.data.value.createdAt ?? ""),
    url: params.articleUrl,
  };
}

export default function ViewArticle({ loaderData }: Route.ComponentProps) {
  const { title, content, splashImageUrl, synopsis, createdAt, url } =
    loaderData;

  return (
    <PageContainer title={title}>
      {splashImageUrl && (
        <PageSection>
          <img
            src={splashImageUrl}
            alt={title}
            style={{ maxWidth: "100%", marginBottom: "1rem" }}
          />
        </PageSection>
      )}
      <PageSection>
        {createdAt && (
          <p style={{ color: "gray", fontSize: "0.875rem" }}>
            {new Date(createdAt).toLocaleDateString()}
          </p>
        )}
        {synopsis && (
          <p style={{ fontStyle: "italic", marginBottom: "1rem" }}>
            {synopsis}
          </p>
        )}
      </PageSection>
      <PageSection>
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </PageSection>

      <FooterPortal>
        <Link to="/article/list">
          <Button variant="secondary" tabIndex={-1}>
            Back to articles
          </Button>
        </Link>
        <Link to={`/article/edit/${url}`}>
          <Button tabIndex={-1}>Edit</Button>
        </Link>
      </FooterPortal>
    </PageContainer>
  );
}
