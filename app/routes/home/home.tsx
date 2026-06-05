import type { Route } from "./+types/home";
import { Link, useFetcher } from "react-router";
import {
  getAtpAgent,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";
import { useModal } from "~/components/Modal/useModal";
import { Spinner } from "~/components/Spinner/Spinner";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { Pill } from "~/components/Pill/Pill";
import styles from "./home.module.css";
import { useToast } from "~/components/Toast/ToastContext";
import { ARTICLE_COLLECTION, SITE_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

const IS_DEV = process.env.NODE_ENV !== "production";

const SCRIBE_COLLECTIONS = [ARTICLE_COLLECTION, SITE_COLLECTION];

type RecentArticle = {
  uri: string;
  title: string;
  url: string;
  createdAt: string;
  updatedAt?: string;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Scribe ATP" },
    {
      name: "description",
      content: "Scribe ATP is a ATproto driven content management system.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { handle, isAuthenticated, did } = await getAuthSession(request);

  if (!isAuthenticated || !did) {
    return {
      userName: handle ?? null,
      isAuthenticated,
      isDev: IS_DEV,
      recentArticles: [] as RecentArticle[],
      orphanedArticleCount: 0,
    };
  }

  if (!useRealOAuth) {
    return {
      userName: handle ?? null,
      isAuthenticated,
      isDev: IS_DEV,
      recentArticles: [
        { uri: "at://did:dev:alice/app.scribe.article/my-first-post", title: "My First Post", url: "my-first-post", createdAt: "2025-06-01T09:00:00.000Z", updatedAt: "2025-06-04T10:00:00.000Z" },
        { uri: "at://did:dev:alice/app.scribe.article/design-principles", title: "Design Principles", url: "design-principles", createdAt: "2025-05-20T08:00:00.000Z", updatedAt: "2025-06-01T09:00:00.000Z" },
        { uri: "at://did:dev:alice/app.scribe.article/getting-started", title: "Getting Started with AT Protocol", url: "getting-started", createdAt: "2025-05-28T14:00:00.000Z" },
      ] as RecentArticle[],
      orphanedArticleCount: 2,
    };
  }

  const agent = await getAtpAgent(did);
  const [articlesResult, sitesResult] = await Promise.all([
    agent.com.atproto.repo.listRecords({ repo: did, collection: ARTICLE_COLLECTION, limit: 100 }),
    agent.com.atproto.repo.listRecords({ repo: did, collection: SITE_COLLECTION, limit: 100 }),
  ]);

  const referencedUris = new Set<string>();
  for (const record of sitesResult.data.records) {
    const value = record.value as Record<string, unknown>;
    const groups = value.groups as Array<{ articles?: Array<{ uri: string }> }> | undefined;
    const topArticles = value.articles as Array<{ uri: string }> | undefined;
    groups?.forEach((g) => g.articles?.forEach((a) => referencedUris.add(a.uri)));
    topArticles?.forEach((a) => referencedUris.add(a.uri));
  }

  const recentArticles: RecentArticle[] = articlesResult.data.records
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      return {
        uri: record.uri,
        title: String(value.title ?? "Untitled"),
        url: String(value.url ?? record.uri.split("/").pop()!),
        createdAt: String(value.createdAt ?? ""),
        updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
      };
    })
    .sort((a, b) =>
      (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    )
    .slice(0, 5);

  const orphanedArticleCount = articlesResult.data.records.filter(
    (r) => !referencedUris.has(r.uri),
  ).length;

  return {
    userName: handle ?? null,
    isAuthenticated,
    isDev: IS_DEV,
    recentArticles,
    orphanedArticleCount,
  };
}

export async function action({ request }: Route.ActionArgs) {
  if (!IS_DEV) return { error: "Not available." };

  const { did } = await getAuthSession(request);
  if (!did) return { error: "Not authenticated." };

  if (!useRealOAuth) {
    return { ok: true, deleted: 0, devMode: true };
  }

  try {
    const agent = await getAtpAgent(did);
    let deleted = 0;

    for (const collection of SCRIBE_COLLECTIONS) {
      let cursor: string | undefined;
      do {
        const result = await agent.com.atproto.repo.listRecords({
          repo: did,
          collection,
          limit: 100,
          cursor,
        });
        await Promise.all(
          result.data.records.map((record) =>
            agent.com.atproto.repo.deleteRecord({
              repo: did,
              collection,
              rkey: record.uri.split("/").pop()!,
            }),
          ),
        );
        deleted += result.data.records.length;
        cursor = result.data.cursor;
      } while (cursor);
    }

    return { ok: true, deleted, devMode: false };
  } catch (err) {
    return { error: `Nuke failed: ${String(err)}` };
  }
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { isAuthenticated, isDev, recentArticles, orphanedArticleCount } = loaderData;
  const nukeModal = useModal();
  const fetcher = useFetcher<{
    ok?: boolean;
    deleted?: number;
    devMode?: boolean;
    error?: string;
  }>();

  const isPending = fetcher.state !== "idle";
  const result = fetcher.data;

  const handleConfirm = () => {
    nukeModal.close();
    fetcher.submit({}, { method: "post" });
  };

  const { addToast } = useToast();

  return (
    <>
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Home}>
            Dashboard
          </PageContainerHeading>
        }
      >
        <PageSection>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.quickActions}>
            <Link to="/article/create">
              <Button type="button">New Article</Button>
            </Link>
            <Link to="/sites">
              <Button type="button" variant="secondary">New Site</Button>
            </Link>
          </div>
        </PageSection>

        {isAuthenticated && orphanedArticleCount > 0 && (
          <PageSection>
            <Link to="/article/list" className={styles.orphanAlert}>
              <Pill variant="danger">
                {orphanedArticleCount} UNASSIGNED {orphanedArticleCount === 1 ? "ARTICLE" : "ARTICLES"}
              </Pill>
              <span>These articles aren't assigned to any site.</span>
            </Link>
          </PageSection>
        )}

        {isAuthenticated && (
          <PageSection>
            <h2 className={styles.sectionTitle}>Recently Updated</h2>
            {recentArticles.length === 0 ? (
              <p className={styles.emptyState}>No articles yet. Create your first one above.</p>
            ) : (
              <ul className={styles.recentList}>
                {recentArticles.map((article) => (
                  <li key={article.uri} className={styles.recentItem}>
                    <span className={styles.recentTitle}>{article.title}</span>
                    <span className={styles.recentDate}>
                      {new Date(article.updatedAt ?? article.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <Link to={`/article/edit/${article.url}`}>
                      <Button type="button" variant="secondary">Edit</Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PageSection>
        )}

        {isDev && (
          <PageSection>
            <div className={styles.devTools}>
              <h2 className={styles.devToolsTitle}>Dev Tools</h2>
              <div className={styles.devToastButtons}>
                <Button
                  onClick={() =>
                    addToast({ heading: "Hello!", content: "This is a test toast.", variant: "primary", expireTimeSeconds: 5 })
                  }
                  variant="primary"
                >
                  Add Toast
                </Button>
                <Button
                  onClick={() =>
                    addToast({ heading: "Hello Again!", content: "This is another test toast.", variant: "secondary", expireTimeSeconds: 15 })
                  }
                  variant="secondary"
                >
                  Add Secondary Toast
                </Button>
                <Button
                  onClick={() =>
                    addToast({ heading: "Warning!", content: "Hot toast!", variant: "danger", expireTimeSeconds: 5 })
                  }
                  variant="danger"
                >
                  Add Danger Toast
                </Button>
              </div>
              <Button
                variant="danger"
                onClick={nukeModal.open}
                disabled={isPending}
              >
                {isPending ? "Nuking…" : "Nuke PDS Data"}
              </Button>
              {result?.ok && (
                <p className={styles.nukeSuccess}>
                  {result.devMode
                    ? "Dev mode — no real data deleted."
                    : `Done. ${result.deleted} record${result.deleted !== 1 ? "s" : ""} deleted.`}
                </p>
              )}
              {result?.error && (
                <p className={styles.nukeError}>{result.error}</p>
              )}
            </div>
          </PageSection>
        )}
      </PageContainer>

      {isDev && (
        <Modal
          isOpen={nukeModal.isOpen}
          onClose={nukeModal.close}
          title="Nuke PDS Data"
          footer={
            <div className={styles.modalFooter}>
              <Button variant="secondary" onClick={nukeModal.close}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirm}>
                Delete Everything
              </Button>
            </div>
          }
        >
          <p>
            This will permanently delete <strong>all</strong> Scribe records
            from your PDS:
          </p>
          <ul className={styles.nukeList}>
            {SCRIBE_COLLECTIONS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p>This cannot be undone.</p>
        </Modal>
      )}
    </>
  );
}
