import type { Route } from "./+types/list";
import { Form, Link } from "react-router";
import { useRef, useState } from "react";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import { devArticleListLoader } from "~/services/devFixtures.server";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Pill } from "~/components/Pill/Pill";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import {
  ARTICLE_COLLECTION,
  DOCUMENT_COLLECTION,
  SITE_COLLECTION,
} from "~/constants";
import { logger } from "~/services/logger.server";
import styles from "./list.module.css";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

type Assignment = {
  siteTitle: string;
  siteRkey: string;
  groupTitle?: string;
};

type PublishedArticle = {
  rkey: string;
  uri: string;
  title: string;
  publishedAt?: string;
  assignments: Assignment[];
};

type OrphanedDraft = {
  rkey: string;
  uri: string;
  title: string;
  cid: string;
  createdAt: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Article List" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) return devArticleListLoader();

  const { agent, did } = await requireAtpAgent(request);

  const [draftsResult, publishedResult, sitesResult] = await Promise.all([
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: ARTICLE_COLLECTION,
      limit: 100,
    }),
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      limit: 100,
    }),
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 100,
    }),
  ]);

  const assignmentMap = new Map<string, Assignment[]>();

  for (const record of sitesResult.data.records) {
    const value = record.value as Record<string, unknown>;
    if (value.scribe == null) continue;
    const scribe = value.scribe as Record<string, unknown>;
    const siteRkey = record.uri.split("/").pop()!;
    const siteTitle = String(scribe.title ?? "");

    for (const a of (scribe.ungroupedArticles as Array<{ uri: string }>) ?? []) {
      const list = assignmentMap.get(a.uri) ?? [];
      list.push({ siteTitle, siteRkey });
      assignmentMap.set(a.uri, list);
    }

    for (const g of (scribe.groups as Array<{
      slug: string;
      title: string;
      articles: Array<{ uri: string }>;
    }>) ?? []) {
      for (const a of g.articles ?? []) {
        const list = assignmentMap.get(a.uri) ?? [];
        list.push({ siteTitle, siteRkey, groupTitle: g.title });
        assignmentMap.set(a.uri, list);
      }
    }
  }

  const publishedArticles: PublishedArticle[] = publishedResult.data.records
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      return {
        rkey: record.uri.split("/").pop()!,
        uri: record.uri,
        title: String(value.title ?? "Untitled"),
        publishedAt: value.publishedAt ? String(value.publishedAt) : undefined,
        assignments: assignmentMap.get(record.uri) ?? [],
      };
    })
    .sort((a, b) =>
      (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    );

  const orphanedDrafts: OrphanedDraft[] = draftsResult.data.records
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      return {
        rkey: record.uri.split("/").pop()!,
        uri: record.uri,
        title: String(value.title ?? "Untitled"),
        cid: record.cid ?? "",
        createdAt: String(value.createdAt ?? ""),
      };
    });

  return { publishedArticles, orphanedDrafts };
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
  logger.info(
    { event: "article.delete", user_did: did, rkey },
    "article.delete",
  );
  return { ok: true };
}

export default function ArticleListIndex({ loaderData }: Route.ComponentProps) {
  const { publishedArticles, orphanedDrafts } = loaderData;
  const deleteModal = useModal();
  const [deleteTarget, setDeleteTarget] = useState<OrphanedDraft | null>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null);

  const handleDeleteClick = (article: OrphanedDraft) => {
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
        <h6 className={styles.sectionHeading}>Published Articles</h6>
        <p className={styles.sectionNote}>
          Manage groups and publish status from each site page.
        </p>
        {publishedArticles.length === 0 ? (
          <div className={styles.emptyState}>
            <p>
              No published articles yet. Assign a draft to a site and publish
              it.
            </p>
          </div>
        ) : (
          <ul className={styles.articleList}>
            {publishedArticles.map((article) => (
              <li key={article.rkey} className={styles.articleItem}>
                <div className={styles.articleTitle}>
                  <strong>{article.title}</strong>
                  {article.publishedAt && (
                    <span>
                      {new Date(article.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className={styles.articleInfo}>
                  {article.assignments.length > 0 ? (
                    article.assignments.map((a, i) => (
                      <Pill key={i}>
                        {a.siteTitle}
                        {a.groupTitle ? ` / ${a.groupTitle}` : ""}
                      </Pill>
                    ))
                  ) : (
                    <Pill variant="danger">Not in any site manifest</Pill>
                  )}
                </div>
                <div className={styles.articleButtons}>
                  {article.assignments[0] && (
                    <Link
                      to={`/article/list/${article.assignments[0].siteRkey}`}
                    >
                      <Button type="button" variant="primary" tabIndex={-1}>
                        Manage
                      </Button>
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {orphanedDrafts.length > 0 && (
        <PageSection>
          <h6 className={styles.sectionHeading}>Unassigned Drafts</h6>
          <p className={styles.sectionNote}>
            These drafts exist in your PDS but haven't been assigned to any
            site. Edit an article to assign it.
          </p>
          <ul className={styles.articleList}>
            {orphanedDrafts.map((article) => (
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
                  <Link to={`/article/edit/${article.rkey}`}>
                    <Button type="button" variant="primary" tabIndex={-1}>
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
        title="Delete Draft"
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
