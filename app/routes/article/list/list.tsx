import type { Route } from "./+types/list";
import { Form, Link, redirect, useFetcher } from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  requireAtpAgent,
  requireAuth,
  useRealOAuth,
} from "~/services/auth.server";
import { devArticleListLoader } from "~/services/devFixtures.server";
import { buildLooseSiteUrl } from "~/services/article.server";
import {
  listDocuments,
  deleteDocument,
} from "~/services/documentRepository.server";
import { listSites } from "~/services/siteRepository.server";
import { findSitesContaining } from "~/services/articleSiteSync.server";
import {
  removeArticleFromSite,
  createGroup as createGroupManifest,
  publishArticleToGroup,
  unpublishArticle,
  validateGroupFields,
} from "~/services/siteManifest.server";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Select } from "~/components/Select/Select";
import { Input } from "~/components/Input/Input";
import {
  ButtonGroupContainer,
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { DOCUMENT_COLLECTION } from "~/constants";
import { logger } from "~/services/logger.server";
import styles from "./list.module.css";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import ArticleSiteIcon from "~/components/ArticleSiteIcon/ArticleSiteIcon";
import type { ArticleAssignment } from "~/components/types";
import ArticleSiteDetailsModalItem from "~/components/ArticleSiteDetailsModalItem/ArticleSiteDetailsModalItem";
import { useToast } from "~/components/Toast/ToastContext";
import { Spinner } from "~/components/Spinner/Spinner";

const NEW_GROUP_VALUE = "__new__";

type PublishTargetSite = {
  rkey: string;
  title: string;
  publicationUri: string;
  notifySubscribersEnabled: boolean;
  groups: Array<{ slug: string; title: string }>;
};

type PublishedArticle = {
  rkey: string;
  uri: string;
  title: string;
  slug: string;
  publishedAt?: string;
  canonicalUrl?: string;
  assignments: ArticleAssignment[];
};

type StandaloneArticle = {
  rkey: string;
  uri: string;
  title: string;
  slug: string;
  cid: string;
  createdAt: string;
  readerUrl: string;
};

export function meta({}: Route.MetaArgs) {
  return [{ title: "Scribe ATP - Article List" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) return devArticleListLoader();

  const { agent, did, handle } = await requireAtpAgent(request);

  try {
    const [documentRecords, siteRecords] = await Promise.all([
      listDocuments(agent, did),
      listSites(agent, did),
    ]);

    const assignmentMap = new Map<string, ArticleAssignment[]>();

    for (const record of siteRecords) {
      const value = record.value;
      if (value.scribe == null) continue;
      const scribe = value.scribe as Record<string, unknown>;
      const siteBase = {
        siteTitle: String(scribe.title ?? ""),
        siteRkey: record.rkey,
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

    const publishedArticles: PublishedArticle[] = documentRecords
      .filter((record) => assignmentMap.has(record.uri))
      .map((record) => {
        const value = record.value;
        const scribe = value.scribe as Record<string, unknown> | undefined;
        return {
          rkey: record.rkey,
          uri: record.uri,
          title: String(value.title ?? "Untitled"),
          slug:
            String(value.path ?? "")
              .split("/")
              .filter(Boolean)
              .pop() ?? "",
          publishedAt: value.publishedAt
            ? String(value.publishedAt)
            : undefined,
          canonicalUrl: scribe?.canonicalUrl
            ? String(scribe.canonicalUrl)
            : undefined,
          assignments: assignmentMap.get(record.uri) ?? [],
        };
      })
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

    // Standalone = DOCUMENT_COLLECTION records not referenced in any site
    // manifest — ADR 0013's Loose Article state. Not "unfinished": a Site is
    // optional, so these can be deliberately, permanently standalone.
    const standaloneArticles: StandaloneArticle[] = documentRecords
      .filter((r) => !assignmentMap.has(r.uri))
      .map((record) => {
        const value = record.value;
        const path = String(value.path ?? "");
        return {
          rkey: record.rkey,
          uri: record.uri,
          title: String(value.title ?? "Untitled"),
          slug: path.split("/").pop() || record.rkey,
          cid: record.cid ?? "",
          createdAt: String(value.createdAt ?? ""),
          readerUrl: buildLooseSiteUrl(did, record.rkey),
        };
      });

    const publishTargets: PublishTargetSite[] = siteRecords
      .filter((record) => record.value.scribe != null)
      .map((record) => {
        const scribe = record.value.scribe as Record<string, unknown>;
        const prefs =
          (record.value.preferences as Record<string, unknown>) ?? {};
        return {
          rkey: record.rkey,
          title: String(scribe.title ?? ""),
          publicationUri: record.uri,
          notifySubscribersEnabled: prefs.notifySubscribersEnabled !== false,
          groups: (
            (scribe.groups as Array<{ slug: string; title: string }>) ?? []
          ).map((g) => ({ slug: g.slug, title: g.title })),
        };
      });

    return {
      publishedArticles,
      standaloneArticles,
      publishTargets,
      authorDid: did,
      authorHandle: handle,
    };
  } catch (err) {
    console.error("Failed to load article list:", err);
    throw redirect("/");
  }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = (formData.get("_intent") as string) || "deleteArticle";

  if (intent === "publishArticle") {
    const uri = formData.get("uri") as string;
    const siteRkey = formData.get("siteRkey") as string;
    const groupSlugRaw = formData.get("groupSlug") as string;
    const newGroupTitle = (
      (formData.get("newGroupTitle") as string) ?? ""
    ).trim();
    if (!uri || !siteRkey) {
      return { ok: false, error: "An article and a site are required." };
    }

    if (!useRealOAuth) return { ok: true };

    const { agent, did } = await requireAtpAgent(request);

    let groupSlug = groupSlugRaw;
    if (groupSlugRaw === NEW_GROUP_VALUE) {
      if (!newGroupTitle) {
        return { ok: false, error: "New group title is required." };
      }
      const validated = validateGroupFields(newGroupTitle);
      if ("error" in validated) return { ok: false, error: validated.error };
      const created = await createGroupManifest(agent, did, siteRkey, {
        title: newGroupTitle,
        slug: validated.slug,
      });
      if ("error" in created) return { ok: false, error: created.error };
      groupSlug = validated.slug;
    }
    if (!groupSlug) return { ok: false, error: "A group is required." };

    return publishArticleToGroup(agent, did, siteRkey, {
      uri,
      groupSlug,
      canonicalSiteRkey: siteRkey,
      siteAssignments: [],
    });
  }

  if (intent === "unpublishArticle") {
    const uri = formData.get("uri") as string;
    const siteRkey = formData.get("siteRkey") as string;
    if (!uri || !siteRkey) {
      return { ok: false, error: "An article and a site are required." };
    }

    if (!useRealOAuth) return { ok: true };

    const { agent, did } = await requireAtpAgent(request);
    const result = await unpublishArticle(agent, did, siteRkey, uri);
    if (!result.ok) {
      return { ok: false, error: "Failed to unpublish article." };
    }

    return { ok: true };
  }

  if (intent === "notifySubscribers") {
    if (!useRealOAuth) return { ok: true, sent: 0, skipped: 0 };

    // Every other intent in this action gates on the caller's own PDS
    // session before doing anything sensitive — this branch was missing
    // that check entirely. requireAuth (not requireAtpAgent) is enough
    // here since no PDS agent is needed, only the caller's did, which we
    // also use below to confirm the publication being notified about is
    // actually theirs.
    const { did } = await requireAuth(request);

    const publicationUri = (formData.get("publicationUri") as string) ?? "";
    const siteTitle = (formData.get("siteTitle") as string) ?? "";
    const articleTitle = (formData.get("articleTitle") as string) ?? "";
    const canonicalUrl = (formData.get("canonicalUrl") as string) ?? "";
    const origin = (formData.get("origin") as string) ?? "";

    if (!publicationUri.startsWith(`at://${did}/`)) {
      return { ok: false, sent: 0, skipped: 0 };
    }

    const socialServiceUrl =
      process.env.SOCIAL_SERVICE_URL ?? "https://social.scribe-atp.app";
    const notifySecret = process.env.NOTIFY_SECRET;

    if (notifySecret && publicationUri && articleTitle && canonicalUrl) {
      try {
        const res = await fetch(`${socialServiceUrl}/notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${notifySecret}`,
          },
          body: JSON.stringify({
            publicationUri,
            siteTitle,
            articleTitle,
            canonicalUrl,
            origin,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          sent?: number;
          skipped?: number;
        };
        if (data.ok) {
          return { ok: true, sent: data.sent ?? 0, skipped: data.skipped ?? 0 };
        }
      } catch (err) {
        logger.warn(
          { event: "notify.cms_call_failed", error: String(err) },
          "notify call failed",
        );
      }
    }

    return { ok: true, sent: 0, skipped: 0 };
  }

  if (!useRealOAuth) return { ok: true };

  const { agent, did } = await requireAtpAgent(request);
  const rkey = formData.get("rkey") as string;
  const cid = formData.get("cid") as string | null;

  try {
    await deleteDocument(agent, did, rkey, cid ?? undefined);

    // Bug fix: an ArticleRef for this uri may still be cached in a site's
    // ungroupedArticles/groups even though it's standalone on this screen
    // (e.g. it was removed from its owning site but still referenced
    // elsewhere) — clean those up too so deleting doesn't leave dangling refs.
    const uri = `at://${did}/${DOCUMENT_COLLECTION}/${rkey}`;
    const siteRkeys = await findSitesContaining(agent, did, uri);
    await Promise.allSettled(
      siteRkeys.map((siteRkey) =>
        removeArticleFromSite(agent, did, siteRkey, uri),
      ),
    );
  } catch (err) {
    console.error("Failed to delete article:", err);
    return { ok: false, error: `Failed to delete article: ${String(err)}` };
  }

  logger.info(
    { event: "article.delete", user_did: did, rkey },
    "article.delete",
  );
  return { ok: true };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function ArticleListIndex({ loaderData }: Route.ComponentProps) {
  const {
    publishedArticles,
    standaloneArticles,
    publishTargets,
    authorDid,
    authorHandle,
  } = loaderData;
  const deleteModal = useModal();
  const [deleteTarget, setDeleteTarget] = useState<StandaloneArticle | null>(
    null,
  );
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const handleDeleteClick = (article: StandaloneArticle) => {
    setDeleteTarget(article);
    deleteModal.open();
  };
  const handleConfirmDelete = () => {
    deleteModal.close();
    deleteFormRef.current?.submit();
  };

  const publishModal = useModal();
  const [publishingArticle, setPublishingArticle] =
    useState<StandaloneArticle | null>(null);
  const [publishSiteRkey, setPublishSiteRkey] = useState("");
  const [publishGroupSlug, setPublishGroupSlug] = useState("");
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const publishFetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    warning?: string;
    notification?: {
      publicationUri: string;
      siteTitle: string;
      articleTitle: string;
      canonicalUrl: string;
    } | null;
  }>();
  const isPublishing = publishFetcher.state !== "idle";

  const unpublishModal = useModal();
  const [unpublishingArticle, setUnpublishingArticle] =
    useState<PublishedArticle | null>(null);
  const unpublishFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isUnpublishing = unpublishFetcher.state !== "idle";

  const handleUnpublishClick = (article: PublishedArticle) => {
    setUnpublishingArticle(article);
    unpublishModal.open();
  };
  const closeUnpublishModal = () => {
    unpublishModal.close();
    setUnpublishingArticle(null);
  };
  const unpublishingAssignment = unpublishingArticle?.assignments[0];

  const notifyModal = useModal();
  const notifyFetcher = useFetcher<{
    ok?: boolean;
    sent?: number;
    skipped?: number;
  }>();
  const isNotifying = notifyFetcher.state !== "idle";
  const [pendingNotification, setPendingNotification] = useState<{
    publicationUri: string;
    siteTitle: string;
    articleTitle: string;
    canonicalUrl: string;
  } | null>(null);

  const handlePublishClick = (article: StandaloneArticle) => {
    setPublishingArticle(article);
    const firstSite = publishTargets[0];
    setPublishSiteRkey(firstSite?.rkey ?? "");
    setPublishGroupSlug(firstSite?.groups[0]?.slug ?? NEW_GROUP_VALUE);
    setNewGroupTitle("");
    publishModal.open();
  };
  const closePublishModal = () => {
    publishModal.close();
    setPublishingArticle(null);
  };
  const selectedPublishSite = publishTargets.find(
    (s) => s.rkey === publishSiteRkey,
  );

  const { addToast } = useToast();

  useEffect(() => {
    if (publishFetcher.state !== "idle" || !publishFetcher.data) return;
    if (publishFetcher.data.ok) {
      closePublishModal();
      addToast({ heading: "Article published", variant: "success" });
      if (publishFetcher.data.warning) {
        addToast({
          heading: "Linked site update failed",
          content: publishFetcher.data.warning,
          variant: "primary",
          autoExpire: false,
        });
      }
      const notifyEnabled = publishTargets.find(
        (s) => s.rkey === publishSiteRkey,
      )?.notifySubscribersEnabled;
      if (notifyEnabled && publishFetcher.data.notification) {
        setPendingNotification(publishFetcher.data.notification);
        notifyModal.open();
      }
    } else if (publishFetcher.data.error) {
      addToast({
        heading: "Publish error",
        content: publishFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [publishFetcher.state, publishFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (notifyFetcher.state !== "idle" || !notifyFetcher.data) return;
    notifyModal.close();
    setPendingNotification(null);
    if (notifyFetcher.data.ok) {
      const { sent = 0 } = notifyFetcher.data;
      addToast({
        heading:
          sent === 0
            ? "No subscribers to notify"
            : `Notified ${sent} subscriber${sent === 1 ? "" : "s"}`,
        variant: "success",
      });
    }
  }, [notifyFetcher.state, notifyFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (unpublishFetcher.state !== "idle" || !unpublishFetcher.data) return;
    if (unpublishFetcher.data.ok) {
      closeUnpublishModal();
      addToast({
        heading: "Article unpublished",
        content: "It's back in Standalone Articles.",
        variant: "success",
      });
    } else if (unpublishFetcher.data.error) {
      addToast({
        heading: "Unpublish error",
        content: unpublishFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [unpublishFetcher.state, unpublishFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const detailsModal = useModal();
  const [detailsData, setDetailsData] = useState<ArticleAssignment | null>(
    null,
  );
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsSlug, setDetailsSlug] = useState("");
  const openDetailsModal = (
    assignment: ArticleAssignment,
    title: string,
    slug: string,
  ) => {
    setDetailsData(assignment);
    setDetailsTitle(title);
    setDetailsSlug(slug);
    detailsModal.open();
  };
  const closeDetailsModal = () => {
    setDetailsData(null);
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
      topButtons={
        <ButtonGroupContainer>
          <Link to={`/article/create`}>
            <Button type="button" variant="primary" tabIndex={-1}>
              Draft New Article
            </Button>
          </Link>
        </ButtonGroupContainer>
      }
    >
      {standaloneArticles.length > 0 && (
        <PageSection>
          <h6 className={styles.sectionHeading}>Standalone Articles</h6>
          <p className={styles.sectionNote}>
            These articles aren't tied to a Site — they're already live on the
            open network and can stay that way, or be published to a Site
            whenever you like.
          </p>
          <ul className={styles.articleList}>
            {standaloneArticles.map((article) => (
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
                  <Link
                    className={styles.canonicalUrlLink}
                    to={article.readerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <small className={styles.monoInfo}>{article.uri}</small>
                  </Link>
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
                  {publishTargets.length > 0 && (
                    <Button
                      type="button"
                      variant="success"
                      onClick={() => handlePublishClick(article)}
                    >
                      Publish
                    </Button>
                  )}
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
            <input type="hidden" name="_intent" value="deleteArticle" />
            <input type="hidden" name="rkey" value={deleteTarget?.rkey ?? ""} />
            <input type="hidden" name="cid" value={deleteTarget?.cid ?? ""} />
          </Form>
        </PageSection>
      )}

      <PageSection>
        <h6 className={styles.sectionHeading}>Site-Assigned Articles</h6>
        <p className={styles.sectionNote}>
          These articles have been published on a Site.
        </p>
        {publishedArticles.length > 0 ? (
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
                    {article.canonicalUrl && (
                      <Link
                        className={styles.canonicalUrlLink}
                        to={article.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <small className={styles.monoInfo}>
                          {article.canonicalUrl}
                        </small>
                      </Link>
                    )}
                  </div>
                  <div className={styles.articleButtons}>
                    {article.assignments[0] && (
                      <ArticleSiteIcon
                        openDetailsModal={openDetailsModal}
                        assignment={article.assignments[0]}
                        articleTitle={article.title}
                        articleSlug={article.slug}
                      />
                    )}

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
                    {article.assignments[0] && (
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => handleUnpublishClick(article)}
                      >
                        Unpublish
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : publishTargets.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No Configured Site. To publish your articles to a website:</p>
            <Link to="/sites/new">
              <Button
                className={styles.CTAbutton}
                type="button"
                icon={SvgImageList.Website}
                tabIndex={-1}
              >
                Create New Site
              </Button>
            </Link>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>
              If you want to display your articles on your website, assign it to
              the site by clicking the &ldquo;Publish&rdquo; button on the
              article above.
            </p>
          </div>
        )}
      </PageSection>

      {detailsData && (
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
          <ArticleSiteDetailsModalItem
            site={detailsData}
            articleSlug={detailsSlug}
          />
        </Modal>
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

      <Modal
        isOpen={publishModal.isOpen}
        onClose={closePublishModal}
        title="Publish Article"
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button variant="secondary" onClick={closePublishModal}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={
                isPublishing ||
                !publishSiteRkey ||
                (publishGroupSlug === NEW_GROUP_VALUE
                  ? !newGroupTitle.trim()
                  : !publishGroupSlug)
              }
              onClick={() => {
                if (!publishingArticle) return;
                const fd = new FormData();
                fd.set("_intent", "publishArticle");
                fd.set("uri", publishingArticle.uri);
                fd.set("siteRkey", publishSiteRkey);
                fd.set("groupSlug", publishGroupSlug);
                if (publishGroupSlug === NEW_GROUP_VALUE) {
                  fd.set("newGroupTitle", newGroupTitle);
                }
                publishFetcher.submit(fd, { method: "post" });
              }}
            >
              {isPublishing ? "Publishing…" : "Publish"}
            </Button>
          </div>
        }
      >
        {publishingArticle && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}
          >
            <p style={{ margin: 0, fontSize: "1.3rem" }}>
              Publish <strong>{publishingArticle.title}</strong> to:
            </p>
            <Select
              name="siteRkey"
              label="Site"
              value={publishSiteRkey}
              onChange={(value) => {
                setPublishSiteRkey(value);
                const site = publishTargets.find((s) => s.rkey === value);
                setPublishGroupSlug(site?.groups[0]?.slug ?? NEW_GROUP_VALUE);
              }}
              options={publishTargets.map((s) => ({
                value: s.rkey,
                label: s.title,
              }))}
            />
            <Select
              name="groupSlug"
              label="Group"
              value={publishGroupSlug}
              onChange={setPublishGroupSlug}
              options={[
                ...(selectedPublishSite?.groups ?? []).map((g) => ({
                  value: g.slug,
                  label: g.title,
                })),
                { value: NEW_GROUP_VALUE, label: "+ Create new group" },
              ]}
            />
            {publishGroupSlug === NEW_GROUP_VALUE && (
              <Input
                id="new-group-title"
                name="newGroupTitle"
                label="New group title"
                placeholder="e.g. Engineering"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
              />
            )}
            {publishFetcher.data?.error && (
              <p
                style={{
                  margin: 0,
                  fontSize: "1.3rem",
                  color: "var(--action-danger)",
                }}
              >
                {publishFetcher.data.error}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={unpublishModal.isOpen}
        onClose={closeUnpublishModal}
        title="Unpublish Article"
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button variant="secondary" onClick={closeUnpublishModal}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isUnpublishing}
              onClick={() => {
                if (!unpublishingArticle || !unpublishingAssignment) return;
                const fd = new FormData();
                fd.set("_intent", "unpublishArticle");
                fd.set("uri", unpublishingArticle.uri);
                fd.set("siteRkey", unpublishingAssignment.siteRkey);
                unpublishFetcher.submit(fd, { method: "post" });
              }}
            >
              {isUnpublishing ? "Unpublishing…" : "Unpublish"}
            </Button>
          </div>
        }
      >
        {unpublishingArticle && unpublishingAssignment && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}
          >
            <p style={{ margin: 0, fontSize: "1.3rem" }}>
              Unpublish <strong>{unpublishingArticle.title}</strong> from{" "}
              <strong>{unpublishingAssignment.siteTitle}</strong>
              {unpublishingAssignment.groupTitle
                ? ` (${unpublishingAssignment.groupTitle})`
                : ""}
              ?
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "1.2rem",
                color: "var(--text-secondary)",
              }}
            >
              It will immediately stop appearing on the live site, and its
              published URL will no longer resolve. The article itself won't
              be deleted — it moves back to Standalone Articles, where you can
              keep editing it or publish it again at any time.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={notifyModal.isOpen}
        onClose={() => {
          notifyModal.close();
          setPendingNotification(null);
        }}
        title="Notify subscribers?"
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => {
                notifyModal.close();
                setPendingNotification(null);
              }}
            >
              Skip
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={isNotifying}
              onClick={() => {
                if (!pendingNotification) return;
                const fd = new FormData();
                fd.set("_intent", "notifySubscribers");
                fd.set("publicationUri", pendingNotification.publicationUri);
                fd.set("siteTitle", pendingNotification.siteTitle);
                fd.set("articleTitle", pendingNotification.articleTitle);
                fd.set("canonicalUrl", pendingNotification.canonicalUrl);
                fd.set(
                  "origin",
                  typeof window !== "undefined" ? window.location.origin : "",
                );
                notifyFetcher.submit(fd, { method: "post" });
              }}
            >
              {isNotifying ? "Notifying…" : "Notify subscribers"}
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: "1.3rem" }}>
          Send a Bluesky DM to all subscribers of{" "}
          <strong>{pendingNotification?.siteTitle}</strong> about this new
          article?
        </p>
        {pendingNotification && (
          <p
            style={{
              margin: "0.8rem 0 0",
              fontSize: "1.2rem",
              color: "var(--text-secondary)",
            }}
          >
            &ldquo;{pendingNotification.articleTitle}&rdquo;
          </p>
        )}
      </Modal>
    </PageContainer>
  );
}
