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
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import { logger } from "~/services/logger.server";
import styles from "./list.module.css";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import AllArticleSitesIcons from "~/components/ArticleSiteIcon/ArticleSiteIcon";
import type { ArticleAssignment } from "~/components/types";
import ArticleSiteDetailsModalItem from "~/components/ArticleSiteDetailsModalItem/ArticleSiteDetailsModalItem";

type PublishedArticle = {
  rkey: string;
  uri: string;
  title: string;
  slug: string;
  publishedAt?: string;
  assignments: ArticleAssignment[];
};

type OrphanedDraft = {
  rkey: string;
  uri: string;
  title: string;
  slug: string;
  cid: string;
  createdAt: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Article List" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) return devArticleListLoader();

  const { agent, did, handle } = await requireAtpAgent(request);

  const [publishedResult, sitesResult] = await Promise.all([
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

  const assignmentMap = new Map<string, ArticleAssignment[]>();

  for (const record of sitesResult.data.records) {
    const value = record.value as Record<string, unknown>;
    if (value.scribe == null) continue;
    const scribe = value.scribe as Record<string, unknown>;
    const siteRkey = record.uri.split("/").pop()!;
    const siteBase = {
      siteTitle: String(scribe.title ?? ""),
      siteRkey,
      siteAtUri: record.uri,
      siteUrl: String(scribe.domain ?? ""),
      siteUrlPrefix: String(scribe.basePath ?? ""),
      logoImageUrl: scribe.logoImageUrl
        ? String(scribe.logoImageUrl)
        : undefined,
      splashImageUrl: scribe.splashImageUrl
        ? String(scribe.splashImageUrl)
        : undefined,
    };

    for (const a of (scribe.ungroupedArticles as Array<{ uri: string }>) ??
      []) {
      const list = assignmentMap.get(a.uri) ?? [];
      list.push({ ...siteBase });
      assignmentMap.set(a.uri, list);
    }

    for (const g of (scribe.groups as Array<{
      slug: string;
      title: string;
      articles: Array<{ uri: string }>;
    }>) ?? []) {
      for (const a of g.articles ?? []) {
        const list = assignmentMap.get(a.uri) ?? [];
        list.push({ ...siteBase, groupTitle: g.title, groupSlug: g.slug });
        assignmentMap.set(a.uri, list);
      }
    }
  }

  const publishedArticles: PublishedArticle[] = publishedResult.data.records
    .filter((record) => assignmentMap.has(record.uri))
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      return {
        rkey: record.uri.split("/").pop()!,
        uri: record.uri,
        title: String(value.title ?? "Untitled"),
        slug:
          String(value.path ?? "")
            .split("/")
            .filter(Boolean)
            .pop() ?? "",
        publishedAt: value.publishedAt ? String(value.publishedAt) : undefined,
        assignments: assignmentMap.get(record.uri) ?? [],
      };
    })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  // Orphaned = DOCUMENT_COLLECTION records not referenced in any site manifest
  const orphanedDrafts: OrphanedDraft[] = publishedResult.data.records
    .filter((r) => !assignmentMap.has(r.uri))
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      const path = String(value.path ?? "");
      return {
        rkey: record.uri.split("/").pop()!,
        uri: record.uri,
        title: String(value.title ?? "Untitled"),
        slug: path.split("/").pop() || record.uri.split("/").pop()!,
        cid: record.cid ?? "",
        createdAt: String(value.createdAt ?? ""),
      };
    });

  return {
    publishedArticles,
    orphanedDrafts,
    authorDid: did,
    authorHandle: handle,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  if (!useRealOAuth) return { ok: true };

  const { agent, did } = await requireAtpAgent(request);
  const rkey = formData.get("rkey") as string;
  const cid = formData.get("cid") as string | null;
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: DOCUMENT_COLLECTION,
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
  const { publishedArticles, orphanedDrafts, authorDid, authorHandle } =
    loaderData;
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

  const detailsModal = useModal();
  const [detailsData, setDetailsData] = useState<ArticleAssignment[]>([]);
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsSlug, setDetailsSlug] = useState("");
  const openDetailsModal = (
    data: ArticleAssignment[],
    title: string,
    slug: string,
  ) => {
    setDetailsData(data);
    setDetailsTitle(title);
    setDetailsSlug(slug);
    detailsModal.open();
  };
  const closeDetailsModal = () => {
    setDetailsData([]);
    setDetailsTitle("");
    detailsModal.close();
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
            {publishedArticles.map((article) => {
              return (
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
                    {/* {article.assignments.length > 0 ? (
                      article.assignments.map((a, i) => (
                        <Pill key={i}>
                          {a.siteTitle}
                          {a.groupTitle ? ` / ${a.groupTitle}` : ""}
                        </Pill>
                      ))
                    ) : (
                      <Pill variant="danger">Not in any site manifest</Pill>
                    )} */}
                  </div>
                  <div className={styles.articleButtons}>
                    <AllArticleSitesIcons
                      openDetailsModal={openDetailsModal}
                      assignments={article.assignments}
                      articleTitle={article.title}
                      articleSlug={article.slug}
                    />

                    <Link to={`/article/view/${article.slug}`}>
                      <Button type="button" variant="secondary" tabIndex={-1}>
                        View
                      </Button>
                    </Link>
                    <Link to={`/article/edit/${article.slug}`}>
                      <Button type="button" variant="primary" tabIndex={-1}>
                        Edit
                      </Button>
                    </Link>
                  </div>
                </li>
              );
            })}
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
                  <Link to={`/article/view/${article.slug}`}>
                    <Button type="button" variant="secondary" tabIndex={-1}>
                      View
                    </Button>
                  </Link>
                  <Link to={`/article/edit/${article.slug}`}>
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

      {detailsData.length > 0 && (
        <Modal
          isOpen={detailsModal.isOpen}
          onClose={closeDetailsModal}
          title={`Site Assignment for "${detailsTitle}"`}
          footer={
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <Button onClick={detailsModal.close} variant="secondary">
                Done
              </Button>
            </div>
          }
        >
          <div>
            {detailsData.map((site) => {
              return (
                <ArticleSiteDetailsModalItem
                  key={site.siteRkey}
                  site={site}
                  articleSlug={detailsSlug}
                />
              );
            })}
          </div>
        </Modal>
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
