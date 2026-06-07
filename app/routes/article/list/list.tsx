import type { Route } from "./+types/list";
import { Form, Link } from "react-router";
import { useRef, useState } from "react";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { ARTICLE_COLLECTION, SITE_COLLECTION } from "~/constants";
import styles from "./list.module.css";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

type Article = {
  rkey: string;
  uri: string;
  title: string;
  cid: string;
  createdAt: string;
};

type Assignment = {
  siteTitle: string;
  siteRkey: string;
  groupTitle?: string;
  groupSlug?: string;
};

type AssignedArticle = Article & { assignments: Assignment[] };
type OrphanedArticle = Article;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Article List" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return {
      assignedArticles: [
        {
          rkey: "my-first-post",
          uri: "at://did:dev:test/app.scribe.article/my-first-post",
          title: "My First Post",
          cid: "dev-cid-a1",
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
          assignments: [
            {
              siteTitle: "NoRobots.blog",
              siteRkey: "norobots-blog",
              groupTitle: "Getting Started",
              groupSlug: "getting-started",
            },
          ],
        },
        {
          rkey: "second-post",
          uri: "at://did:dev:test/app.scribe.article/second-post",
          title: "Second Post",
          cid: "dev-cid-a2",
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          assignments: [
            { siteTitle: "NoRobots.blog", siteRkey: "norobots-blog" },
            {
              siteTitle: "Perpetual Summer LTD",
              siteRkey: "perpetualsummer-ltd",
            },
          ],
        },
      ] as AssignedArticle[],
      orphanedArticles: [
        {
          rkey: "dev-orphan",
          uri: "at://did:dev:test/app.scribe.article/dev-orphan",
          title: "Dev Orphan Article",
          cid: "dev-cid",
          createdAt: new Date().toISOString(),
        },
      ] as OrphanedArticle[],
    };
  }

  const { agent, did } = await requireAtpAgent(request);

  const [articlesResult, sitesResult] = await Promise.all([
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: ARTICLE_COLLECTION,
      limit: 100,
    }),
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 100,
    }),
  ]);

  const referencedUris = new Set<string>();
  const assignmentMap = new Map<string, Assignment[]>();

  for (const record of sitesResult.data.records) {
    const value = record.value as Record<string, unknown>;
    const siteRkey = record.uri.split("/").pop()!;
    const siteTitle = String(value.title ?? "");

    for (const a of (value.ungroupedArticles as Array<{ uri: string }>) ?? []) {
      referencedUris.add(a.uri);
      const list = assignmentMap.get(a.uri) ?? [];
      list.push({ siteTitle, siteRkey });
      assignmentMap.set(a.uri, list);
    }

    for (const g of (value.groups as Array<{
      slug: string;
      title: string;
      articles: Array<{ uri: string }>;
    }>) ?? []) {
      for (const a of g.articles ?? []) {
        referencedUris.add(a.uri);
        const list = assignmentMap.get(a.uri) ?? [];
        list.push({
          siteTitle,
          siteRkey,
          groupTitle: g.title,
          groupSlug: g.slug,
        });
        assignmentMap.set(a.uri, list);
      }
    }
  }

  const assignedArticles: AssignedArticle[] = [];
  const orphanedArticles: OrphanedArticle[] = [];

  for (const record of articlesResult.data.records) {
    const value = record.value as Record<string, unknown>;
    const article: Article = {
      rkey: record.uri.split("/").pop()!,
      uri: record.uri,
      title: String(value.title ?? ""),
      cid: record.cid ?? "",
      createdAt: String(value.createdAt ?? ""),
    };

    if (referencedUris.has(record.uri)) {
      assignedArticles.push({
        ...article,
        assignments: assignmentMap.get(record.uri) ?? [],
      });
    } else {
      orphanedArticles.push(article);
    }
  }

  return { assignedArticles, orphanedArticles };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  if (!useRealOAuth) return { ok: true };

  const { agent, did } = await requireAtpAgent(request);
  const rkey = formData.get("rkey") as string;
  const cid = formData.get("cid") as string | null;
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey,
    swapRecord: cid ?? undefined,
  });
  return { ok: true };
}

export default function ArticleListIndex({ loaderData }: Route.ComponentProps) {
  const { assignedArticles, orphanedArticles } = loaderData;
  const deleteModal = useModal();
  const [deleteTarget, setDeleteTarget] = useState<OrphanedArticle | null>(
    null,
  );
  const deleteFormRef = useRef<HTMLFormElement>(null);

  const handleDeleteClick = (article: OrphanedArticle) => {
    setDeleteTarget(article);
    deleteModal.open();
  };

  const handleConfirmDelete = () => {
    deleteModal.close();
    deleteFormRef.current?.submit();
  };

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Article List
        </PageContainerHeading>
      }
    >
      <PageSection>
        <h3 className={styles.sectionHeading}>Assigned Articles</h3>
        {assignedArticles.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No articles have been assigned to a site yet.</p>
          </div>
        ) : (
          <ul className={styles.articleList}>
            {assignedArticles.map((article) => (
              <li key={article.rkey} className={styles.articleItem}>
                <div className={styles.articleTitle}>
                  <strong>{article.title}</strong>
                  {article.createdAt && (
                    <span>
                      {new Date(article.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className={styles.articleInfo}>
                  <small style={{ fontFamily: "monospace" }}>
                    {article.uri}
                  </small>
                </div>
                <div className={styles.articleButtons}>
                  <Link to={`/article/view/${article.rkey}`}>
                    <Button type="button" variant="secondary">
                      View
                    </Button>
                  </Link>
                  <Link to={`/article/edit/${article.rkey}`}>
                    <Button type="button" variant="primary">
                      Edit
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {orphanedArticles.length > 0 && (
        <PageSection>
          <h3 className={styles.sectionHeading}>Unassigned Articles</h3>
          <p className={styles.sectionNote}>
            These articles exist in your PDS but haven't been assigned to any
            site. Edit an article to assign it.
          </p>
          <ul className={styles.articleList}>
            {orphanedArticles.map((article) => (
              <li key={article.rkey} className={styles.articleItem}>
                <div className={styles.articleTitle}>
                  <strong>{article.title}</strong>
                  {article.createdAt && (
                    <span>
                      {new Date(article.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className={styles.articleInfo}>
                  <small style={{ fontFamily: "monospace" }}>
                    {article.uri}
                  </small>
                </div>
                <div className={styles.articleButtons}>
                  <Link to={`/article/view/${article.rkey}`}>
                    <Button type="button" variant="secondary">
                      View
                    </Button>
                  </Link>
                  <Link to={`/article/edit/${article.rkey}`}>
                    <Button type="button" variant="primary">
                      Edit
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => handleDeleteClick(article)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <Form ref={deleteFormRef} method="post" style={{ display: "none" }}>
            <input type="hidden" name="rkey" value={deleteTarget?.rkey ?? ""} />
            <input type="hidden" name="cid" value={deleteTarget?.cid ?? ""} />
          </Form>
        </PageSection>
      )}

      <Modal
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        title="Delete Article"
        footer={
          <div
            style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
          >
            <Button onClick={deleteModal.close} variant="secondary">
              Cancel
            </Button>
            <Button onClick={handleConfirmDelete} variant="danger">
              Delete
            </Button>
          </div>
        }
      >
        <p>
          Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;?
        </p>
      </Modal>
    </PageContainer>
  );
}
