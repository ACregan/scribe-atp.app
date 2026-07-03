import type { Route } from "./+types/view";
import { Link } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import { devViewLoader } from "~/services/devFixtures.server";
import DOMPurify from "isomorphic-dompurify";
import { Button } from "~/components/Button/Button";
import { Pill } from "~/components/Pill/Pill";
import { Spinner } from "~/components/Spinner/Spinner";
import { DOCUMENT_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import styles from "./view.module.css";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.title ? `${data.title} – Scribe ATP` : "Scribe ATP" }];
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

function computeReadMinutes(textContent: string): number {
  const words = textContent.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function bskyPostUrl(uri: string): string {
  const parts = uri.replace("at://", "").split("/");
  return `https://bsky.app/profile/${parts[0]}/post/${parts[2]}`;
}

async function fetchCount(
  socialServiceUrl: string,
  actionType: string,
  documentUri: string,
): Promise<number> {
  try {
    const url = new URL(`${socialServiceUrl}/counts`);
    url.searchParams.set("action_type", actionType);
    url.searchParams.set("document_uri", documentUri);
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!useRealOAuth) return devViewLoader(params.articleUrl);

  const { agent, did } = await requireAtpAgent(request);

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

  const scribe = (value.scribe as Record<string, unknown>) ?? {};
  const textContent = String(value.textContent ?? "");

  const bskyPostRefRaw = value.bskyPostRef as
    | { uri: string; cid: string }
    | undefined;

  const socialServiceUrl =
    process.env.SOCIAL_SERVICE_URL ?? "https://social.scribe-atp.app";
  const [likes, shares] = await Promise.all([
    fetchCount(socialServiceUrl, "recommend", found.uri),
    fetchCount(socialServiceUrl, "share", found.uri),
  ]);

  return {
    title: String(value.title ?? "(untitled)"),
    content: DOMPurify.sanitize(html, { FORCE_BODY: true }),
    splashImageUrl: String(
      scribe.coverImageUrl ?? scribe.splashImageUrl ?? value.splashImageUrl ?? "",
    ),
    description: String(value.description ?? value.synopsis ?? ""),
    createdAt: String(scribe.createdAt ?? value.createdAt ?? ""),
    publishedAt: String(value.publishedAt ?? ""),
    updatedAt: String(value.updatedAt ?? ""),
    tags: Array.isArray(value.tags) ? (value.tags as string[]) : [],
    readMinutes: textContent ? computeReadMinutes(textContent) : null,
    bskyPostRef: bskyPostRefRaw ?? null,
    siteDomain: String(scribe.domain ?? ""),
    slug,
    likes,
    shares,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ViewArticle({ loaderData }: Route.ComponentProps) {
  const {
    title,
    content,
    splashImageUrl,
    description,
    createdAt,
    publishedAt,
    updatedAt,
    tags,
    readMinutes,
    bskyPostRef,
    siteDomain,
    slug,
    likes,
    shares,
  } = loaderData;

  const displayDate = publishedAt || createdAt;
  const showUpdated =
    updatedAt && updatedAt !== publishedAt && updatedAt !== createdAt;

  return (
    <PageContainer title={title}>
      <PageSection>
        {/* Meta row */}
        <div className={styles.meta}>
          {displayDate && (
            <>
              <span>
                {publishedAt ? "Published" : "Created"} {formatDate(displayDate)}
              </span>
            </>
          )}
          {showUpdated && (
            <>
              <span className={styles.metaSep}>·</span>
              <span>Updated {formatDate(updatedAt)}</span>
            </>
          )}
          {readMinutes !== null && (
            <>
              <span className={styles.metaSep}>·</span>
              <span>{readMinutes} min read</span>
            </>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.map((tag) => (
              <Pill key={tag} variant="secondary">
                {tag}
              </Pill>
            ))}
          </div>
        )}

        {/* Splash image */}
        {splashImageUrl && (
          <img
            src={splashImageUrl}
            alt={title}
            className={styles.splashImage}
          />
        )}

        {/* Description */}
        {description && (
          <p className={styles.description}>{description}</p>
        )}

        {/* Content */}
        <div
          className={styles.content}
          dangerouslySetInnerHTML={{ __html: content }}
        />

        {/* Stats bar */}
        <div className={styles.statsBar}>
          <span className={styles.statItem}>
            <span>♥</span>
            <span className={styles.statCount}>{likes}</span>
            <span>{likes === 1 ? "like" : "likes"}</span>
          </span>
          <span className={styles.statItem}>
            <span>↗</span>
            <span className={styles.statCount}>{shares}</span>
            <span>{shares === 1 ? "share" : "shares"}</span>
          </span>
          {bskyPostRef && (
            <a
              href={bskyPostUrl(bskyPostRef.uri)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.bskyLink}
            >
              <SvgIcon
                name={SvgImageList.SocialBlueSky}
                fill="currentColor"
                className={styles.bskyIcon}
              />
              View on Bluesky
            </a>
          )}
          {siteDomain && (
            <span className={styles.siteDomain}>{siteDomain}</span>
          )}
        </div>
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
