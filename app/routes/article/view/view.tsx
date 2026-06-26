import type { Route } from "./+types/view";
import { Link } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import { devViewLoader } from "~/services/devFixtures.server";
import DOMPurify from "isomorphic-dompurify";
import { Button } from "~/components/Button/Button";
import { DOCUMENT_COLLECTION } from "~/constants";
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

  // Resolve slug → TID via listRecords scan (same pattern as edit loader)
  const slug = params.articleUrl;
  const allRecords: Array<{ uri: string; cid: string; value: unknown }> = [];
  let cursor: string | undefined;
  do {
    const listResult = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      limit: 100,
      cursor,
    });
    allRecords.push(...(listResult.data.records as typeof allRecords));
    cursor = listResult.data.cursor;
  } while (cursor);

  const found = allRecords.find((r) => {
    const path = String((r.value as Record<string, unknown>).path ?? "");
    return path.split("/").pop() === slug;
  });

  if (!found) throw new Response("Article not found", { status: 404 });

  const value = found.value as Record<string, unknown>;
  const rawContent = value.content;
  const html =
    typeof rawContent === "object" &&
    rawContent !== null &&
    (rawContent as Record<string, unknown>).$type === "app.scribe.content.html"
      ? String((rawContent as Record<string, unknown>).html ?? "")
      : String(rawContent ?? "");

  return {
    title: String(value.title ?? "(untitled)"),
    content: DOMPurify.sanitize(html, { FORCE_BODY: true }),
    splashImageUrl: String(value.splashImageUrl ?? ""),
    description: String(value.description ?? value.synopsis ?? ""),
    createdAt: String(value.createdAt ?? ""),
    slug,
  };
}

export default function ViewArticle({ loaderData }: Route.ComponentProps) {
  const { title, content, splashImageUrl, description, createdAt, slug } =
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
        {description && (
          <p style={{ fontStyle: "italic", marginBottom: "1rem" }}>
            {description}
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
        <Link to={`/article/edit/${slug}`}>
          <Button tabIndex={-1}>Edit</Button>
        </Link>
      </FooterPortal>
    </PageContainer>
  );
}
