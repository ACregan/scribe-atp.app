import type { Route } from "./+types/list";
import { Form, Link } from "react-router";
import { useRef, useState } from "react";
import { getAtpAgent, requireAuth, useRealOAuth } from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import {
  PageContainer,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { ARTICLE_COLLECTION, SITE_COLLECTION } from "~/constants";
import styles from "./list.module.css";

type SiteRef = {
  rkey: string;
  title: string;
  url: string;
};

type OrphanedArticle = {
  rkey: string;
  uri: string;
  title: string;
  cid: string;
  createdAt: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Article Lists" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { did } = await requireAuth(request);

  if (!useRealOAuth) {
    return {
      sites: [
        { rkey: "norobots-blog", title: "NoRobots.blog", url: "norobots.blog" },
        {
          rkey: "perpetualsummer-ltd",
          title: "Perpetual Summer LTD",
          url: "perpetualsummer.ltd",
        },
      ] as SiteRef[],
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

  const agent = await getAtpAgent(did);

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
  for (const record of sitesResult.data.records) {
    const value = record.value as Record<string, unknown>;
    for (const a of (value.articles as Array<{ uri: string }>) ?? []) {
      referencedUris.add(a.uri);
    }
    for (const g of (value.groups as Array<{
      articles: Array<{ uri: string }>;
    }>) ?? []) {
      for (const a of g.articles ?? []) {
        referencedUris.add(a.uri);
      }
    }
  }

  const sites: SiteRef[] = sitesResult.data.records.map((record) => {
    const value = record.value as Record<string, unknown>;
    return {
      rkey: record.uri.split("/").pop()!,
      title: String(value.title ?? ""),
      url: String(value.url ?? ""),
    };
  });

  const orphanedArticles: OrphanedArticle[] = articlesResult.data.records
    .filter((record) => !referencedUris.has(record.uri))
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      return {
        rkey: record.uri.split("/").pop()!,
        uri: record.uri,
        title: String(value.title ?? ""),
        cid: record.cid ?? "",
        createdAt: String(value.createdAt ?? ""),
      };
    });

  return { sites, orphanedArticles };
}

export async function action({ request }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const formData = await request.formData();

  if (!useRealOAuth) return { ok: true };

  const rkey = formData.get("rkey") as string;
  const cid = formData.get("cid") as string | null;
  const agent = await getAtpAgent(did);
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: ARTICLE_COLLECTION,
    rkey,
    swapRecord: cid ?? undefined,
  });
  return { ok: true };
}

export default function ArticleListIndex({ loaderData }: Route.ComponentProps) {
  const { sites, orphanedArticles } = loaderData;
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
    <PageContainer title="Article Lists">
      <PageSection>
        {sites.length === 0 ? (
          <p className={styles.emptyState}>
            No sites yet.{" "}
            <Link to="/sites">Add a site</Link> to get started.
          </p>
        ) : (
          <ul className={styles.siteList}>
            {sites.map((site) => (
              <li key={site.rkey} className={styles.siteItem}>
                <div className={styles.siteInfo}>
                  <strong className={styles.siteTitle}>{site.title}</strong>
                  <span className={styles.siteUrl}>{site.url}</span>
                </div>
                <div className={styles.siteActions}>
                  <Link to={`/article/list/${site.rkey}`}>
                    <Button type="button">Manage Articles</Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {orphanedArticles.length > 0 && (
        <PageSection>
          <h2 className={styles.sectionHeading}>Unassigned Articles</h2>
          <p className={styles.sectionNote}>
            These articles exist in your PDS but haven't been assigned to any
            site. Edit an article to assign it.
          </p>
          <ul className={styles.orphanList}>
            {orphanedArticles.map((article) => (
              <li key={article.rkey} className={styles.orphanItem}>
                <div className={styles.orphanTitle}>
                  <strong>{article.title}</strong>
                  {article.createdAt && (
                    <span>
                      {new Date(article.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className={styles.orphanInfo}>
                  <small style={{ fontFamily: "monospace" }}>
                    {article.uri}
                  </small>
                </div>
                <div className={styles.orphanButtons}>
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
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <Button onClick={deleteModal.close} variant="secondary">
              Cancel
            </Button>
            <Button onClick={handleConfirmDelete} variant="danger">
              Delete
            </Button>
          </div>
        }
      >
        <p>Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;?</p>
      </Modal>
    </PageContainer>
  );
}
