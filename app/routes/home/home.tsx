import { useEffect } from "react";
import type { Route } from "./+types/home";
import { Link, useFetcher } from "react-router";
import {
  getAtpAgent,
  getAuthSession,
  rethrowIfRedirect,
  useRealOAuth,
} from "~/services/auth.server";
import { devHomeLoader } from "~/services/devFixtures.server";
import { useModal } from "~/components/Modal/useModal";
import { Spinner } from "~/components/Spinner/Spinner";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { Pill } from "~/components/Pill/Pill";
import styles from "./home.module.css";
import { useToast } from "~/components/Toast/ToastContext";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
  PageSectionColumns,
  PageSectionColumn,
} from "~/components/PageContainer/PageContainer";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { IconBadge } from "~/components/IconBadge/IconBadge";
import { logger } from "~/services/logger.server";
import OverflowMenu from "~/components/OverflowMenu/OverflowMenu";
import {
  buildEngagementCharts,
  type EngagementCharts,
} from "./engagementCharts.server";
import { DashboardCharts } from "./DashboardCharts/DashboardCharts";
import { SiteWelcome } from "./SiteWelcome/SiteWelcome";

const IS_DEV = process.env.NODE_ENV !== "production";

function formatArticleDate(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return `${time} ${date}`;
}

const SCRIBE_COLLECTIONS = [DOCUMENT_COLLECTION, SITE_COLLECTION];
const RECOMMEND_COLLECTION = "site.standard.graph.recommend";

type RecentArticleItem = {
  uri: string;
  title: string;
  slug: string;
  createdAt: string;
  updatedAt?: string;
};

type SiteWithGroups = {
  rkey: string;
  title: string;
  siteUrl: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
  groups: Array<{ slug: string; title: string; articleCount: number }>;
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
  const { handle, did } = await getAuthSession(request);

  if (!did) {
    return { isAuthenticated: false as const };
  }

  if (!useRealOAuth) {
    return {
      isAuthenticated: true as const,
      ...devHomeLoader(handle),
      engagementCharts: null as EngagementCharts | null,
    };
  }

  const agent = await getAtpAgent(did, request);
  const [documentsResult, sitesResult] = await Promise.all([
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

  const sites: SiteWithGroups[] = sitesResult.data.records
    .filter(
      (record) => (record.value as Record<string, unknown>).scribe != null,
    )
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      const scribe = (value.scribe as Record<string, unknown>) ?? {};
      const rawGroups =
        (scribe.groups as
          | Array<{
              slug: string;
              title: string;
              articles?: Array<{ uri: string }>;
            }>
          | undefined) ?? [];
      return {
        rkey: record.uri.split("/").pop()!,
        title: String(scribe.title ?? ""),
        siteUrl: String(value.url ?? ""),
        splashImageUrl: scribe.splashImageUrl
          ? String(scribe.splashImageUrl)
          : undefined,
        logoImageUrl: scribe.logoImageUrl
          ? String(scribe.logoImageUrl)
          : undefined,
        groups: rawGroups.map(({ slug, title, articles }) => ({
          slug,
          title,
          articleCount: articles?.length ?? 0,
        })),
      };
    });

  // Build set of all document URIs referenced in any site manifest
  const assignedUris = new Set<string>();
  for (const record of sitesResult.data.records) {
    const scribe =
      ((record.value as Record<string, unknown>).scribe as Record<
        string,
        unknown
      >) ?? {};
    for (const a of (scribe.ungroupedArticles as Array<{ uri: string }>) ?? [])
      assignedUris.add(a.uri);
    for (const g of (scribe.groups as Array<{
      articles: Array<{ uri: string }>;
    }>) ?? []) {
      for (const a of g.articles ?? []) assignedUris.add(a.uri);
    }
  }

  const recentArticles: RecentArticleItem[] = documentsResult.data.records
    .slice(0, 8)
    .map((record) => {
      const value = record.value as Record<string, unknown>;
      const path = String(value.path ?? "");
      return {
        uri: record.uri,
        title: String(value.title ?? "Untitled"),
        slug: path.split("/").pop() || record.uri.split("/").pop()!,
        createdAt: String(value.createdAt ?? ""),
        updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
      };
    })
    .sort((a, b) =>
      (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    )
    .slice(0, 10);

  const orphanedArticleCount = documentsResult.data.records.filter(
    (r) => !assignedUris.has(r.uri),
  ).length;

  const socialServiceUrl =
    process.env.SOCIAL_SERVICE_URL ?? "https://social.scribe-atp.app";
  const engagementCharts = await buildEngagementCharts(
    sites,
    socialServiceUrl,
  ).catch(() => null);

  return {
    isAuthenticated: true as const,
    userName: handle ?? null,
    isDev: IS_DEV,
    recentArticles,
    orphanedArticleCount,
    sites,
    engagementCharts,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "nuke");

  const { did } = await getAuthSession(request);
  if (!did) return { ok: false, error: "Not authenticated." };

  if (intent === "clearLikes") {
    // Bug fix: this is a dev-only tool (the button is gated behind isDev in
    // the UI, same as Nuke below), but unlike Nuke it had no server-side
    // IS_DEV gate — any authenticated user could reach it in production via
    // a direct POST.
    if (!IS_DEV) return { ok: false, error: "Not available." };
    if (!useRealOAuth) return { ok: true, deleted: 0, devMode: true };
    try {
      const agent = await getAtpAgent(did, request);
      let deleted = 0;
      let cursor: string | undefined;
      do {
        const result = await agent.com.atproto.repo.listRecords({
          repo: did,
          collection: RECOMMEND_COLLECTION,
          limit: 100,
          cursor,
        });
        await Promise.all(
          result.data.records.map((record) =>
            agent.com.atproto.repo.deleteRecord({
              repo: did,
              collection: RECOMMEND_COLLECTION,
              rkey: record.uri.split("/").pop()!,
            }),
          ),
        );
        deleted += result.data.records.length;
        cursor = result.data.cursor;
      } while (cursor);
      logger.info(
        { event: "likes.clear", user_did: did, deleted_count: deleted },
        "likes.clear",
      );
      return { ok: true, deleted, devMode: false };
    } catch (err) {
      rethrowIfRedirect(err);
      return { ok: false, error: `Clear likes failed: ${String(err)}` };
    }
  }

  // nuke
  if (!IS_DEV) return { ok: false, error: "Not available." };
  if (!useRealOAuth) return { ok: true, deleted: 0, devMode: true };
  try {
    const agent = await getAtpAgent(did, request);
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
    logger.warn(
      { event: "article.nuke", user_did: did, deleted_count: deleted },
      "article.nuke",
    );
    return { ok: true, deleted, devMode: false };
  } catch (err) {
    rethrowIfRedirect(err);
    return { ok: false, error: `Nuke failed: ${String(err)}` };
  }
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

function Landing() {
  return (
    <div className={styles.landing}>
      <video
        className={styles.landingVideo}
        src={"/video/dot-wave-1.mp4"}
        muted
        autoPlay
        loop
      />
      <div className={styles.landingGrid}>
        <div className={styles.leftGutter}></div>
        <div className={styles.leftSection}>
          <SvgIcon
            className={styles.landingLogo}
            name={SvgImageList.ScribeCMSLogo}
          />

          <p className={styles.landingTagline}>
            AT Protocol-powered content management.
          </p>
        </div>
        <div className={styles.rightSection}>
          <div className={styles.blurbContainer}>
            <p>
              Scribe is a content management system built on the AT Protocol —
              the same open network that powers Bluesky. Your articles are
              stored in your own Personal Data Server, meaning your content
              belongs to you, is publicly readable by anyone, and travels with
              your identity across the open web. No lock-in, no black boxes.
              Just your words, in your repository.
            </p>
            <div className={styles.landingActions}>
              <a
                href="https://bsky.app/hashtag/Register"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" variant="secondary" tabIndex={-1}>
                  Sign Up
                </Button>
              </a>
              <Link to="/login">
                <Button type="button" variant="primary" tabIndex={-1}>
                  Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className={styles.topMargin}></div>
        <div className={styles.bottomMargin}>
          <a
            href="https://perpetualsummer.ltd/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.psLogoContainer}
          >
            <SvgIcon name={SvgImageList.PerpetualSummerLogoAndText} />
          </a>
        </div>
        <div className={styles.rightGutter}></div>
      </div>
    </div>
  );
}

function GroupSiteItem({
  site,
  showGroups = true,
}: {
  site: SiteWithGroups;
  showGroups?: boolean;
}) {
  return (
    <li className={styles.siteItem}>
      <div className={styles.siteHeader}>
        <div
          className={styles.splashContainer}
          style={
            site.splashImageUrl
              ? { backgroundImage: `url(${site.splashImageUrl})` }
              : undefined
          }
        >
          <div
            className={styles.logoContainer}
            style={
              site.logoImageUrl
                ? { backgroundImage: `url(${site.logoImageUrl})` }
                : undefined
            }
          />
        </div>
        <Link className={styles.siteTitleLink} to={site.siteUrl}>
          <div className={styles.siteTitleContainer}>
            <strong className={styles.siteTitle}>{site.title}</strong>
            <SvgIcon
              className={styles.siteTitleIcon}
              name={SvgImageList.OpenInNewTab}
            />
          </div>
        </Link>
        <div className={styles.siteActions}>
          <Link to={`/article/list/${site.rkey}`}>
            <Button type="button" variant="primary" tabIndex={-1}>
              Manage
            </Button>
          </Link>
        </div>
      </div>
      {showGroups && site.groups.length > 0 && (
        <ul className={styles.groupList}>
          {site.groups.map((group) => (
            <li key={group.slug} className={styles.groupItem}>
              <IconBadge icon={SvgImageList.Folder} />
              <span className={styles.folderName}>{group.title}</span>
              <Pill>
                {group.articleCount}{" "}
                {group.articleCount === 1 ? "ARTICLE" : "ARTICLES"}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function RecentArticlesColumn({
  recentArticles,
}: {
  recentArticles: RecentArticleItem[];
}) {
  return (
    <>
      <h2 className={styles.sectionTitle}>Recently Updated</h2>
      {recentArticles.length === 0 ? (
        <p className={styles.emptyState}>
          No articles yet. Create your first one.
        </p>
      ) : (
        <ul className={styles.recentList}>
          {recentArticles.map((article) => (
            <li key={article.uri} className={styles.recentItem}>
              <IconBadge icon={SvgImageList.Document} />
              <span className={styles.recentTitle}>{article.title}</span>
              <Pill>
                {formatArticleDate(article.updatedAt ?? article.createdAt)}
              </Pill>
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
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const nukeModal = useModal();
  const devToolsModal = useModal();
  const clearLikesModal = useModal();
  const nukeFetcher = useFetcher<{
    ok?: boolean;
    deleted?: number;
    devMode?: boolean;
    error?: string;
  }>();
  const clearLikesFetcher = useFetcher<{
    ok?: boolean;
    deleted?: number;
    devMode?: boolean;
    error?: string;
  }>();
  const { addToast } = useToast();

  const isNukePending = nukeFetcher.state !== "idle";
  const isClearLikesPending = clearLikesFetcher.state !== "idle";

  useEffect(() => {
    if (!nukeFetcher.data) return;
    if (nukeFetcher.data.ok) {
      addToast({
        heading: "Nuke complete",
        content: nukeFetcher.data.devMode
          ? "Dev mode — no real data deleted."
          : `${nukeFetcher.data.deleted} record${nukeFetcher.data.deleted !== 1 ? "s" : ""} deleted.`,
        variant: "primary",
      });
    } else if (nukeFetcher.data.error) {
      addToast({
        heading: "Nuke failed",
        content: nukeFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [nukeFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clearLikesFetcher.data) return;
    if (clearLikesFetcher.data.ok) {
      addToast({
        heading: "Likes cleared",
        content: clearLikesFetcher.data.devMode
          ? "Dev mode — no real data deleted."
          : `${clearLikesFetcher.data.deleted} like${clearLikesFetcher.data.deleted !== 1 ? "s" : ""} deleted.`,
        variant: "primary",
      });
    } else if (clearLikesFetcher.data.error) {
      addToast({
        heading: "Clear likes failed",
        content: clearLikesFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [clearLikesFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaderData.isAuthenticated) {
    return <Landing />;
  }

  const {
    isDev,
    userName,
    recentArticles,
    orphanedArticleCount,
    sites,
    engagementCharts,
  } = loaderData;

  const hasSites = sites.length > 0;
  const hasArticles = recentArticles.length > 0;

  function handleNukeConfirm() {
    nukeModal.close();
    nukeFetcher.submit({ _intent: "nuke" }, { method: "post" });
  }

  function handleClearLikesConfirm() {
    clearLikesModal.close();
    clearLikesFetcher.submit({ _intent: "clearLikes" }, { method: "post" });
  }

  return (
    <>
      <PageContainer
        fixed
        title={
          <PageContainerHeading icon={SvgImageList.Home}>
            Dashboard
          </PageContainerHeading>
        }
        topButtons={
          <>
            <div className={styles.quickActions}>
              <Link to="/sites/new">
                <Button type="button" icon={SvgImageList.Website} tabIndex={-1}>
                  New Site
                </Button>
              </Link>
              {sites.length > 0 ? (
                <Link to="/groups/new">
                  <Button
                    type="button"
                    icon={SvgImageList.Folder}
                    tabIndex={-1}
                  >
                    New Group
                  </Button>
                </Link>
              ) : (
                <Button
                  type="button"
                  icon={SvgImageList.Folder}
                  disabled
                  title="Create a site first — groups belong to a site"
                >
                  New Group
                </Button>
              )}
              <Link to="/article/create">
                <Button
                  type="button"
                  icon={SvgImageList.Document}
                  tabIndex={-1}
                >
                  New Article
                </Button>
              </Link>
              <Link to="/images">
                <Button type="button" icon={SvgImageList.Image} tabIndex={-1}>
                  Image Library
                </Button>
              </Link>
            </div>
            {isDev && (
              <Button
                type="button"
                variant="secondary"
                onClick={devToolsModal.open}
              >
                Dev Tools
              </Button>
            )}
          </>
        }
      >
        {orphanedArticleCount > 0 && (
          <PageSection>
            <Link to="/article/list" className={styles.orphanAlert}>
              <Pill variant="danger">
                {orphanedArticleCount} UNASSIGNED{" "}
                {orphanedArticleCount === 1 ? "ARTICLE" : "ARTICLES"}
              </Pill>
              <span>These articles aren't assigned to any site.</span>
            </Link>
          </PageSection>
        )}
        {hasSites || hasArticles ? (
          <PageSection fill>
            {hasSites ? (
              <PageSectionColumns breakpoint="lg">
                {/* Sites */}
                <PageSectionColumn span={4} overflow>
                  <h2 className={styles.sectionTitle}>Sites</h2>
                  <ul className={styles.siteList}>
                    {sites.map((site) => (
                      <GroupSiteItem
                        key={site.rkey}
                        site={site}
                        showGroups={false}
                      />
                    ))}
                  </ul>
                </PageSectionColumn>

                {/* Engagement charts */}
                <PageSectionColumn span={4} overflow>
                  <h2 className={styles.sectionTitle}>ENGAGEMENT</h2>
                  {engagementCharts && (
                    <DashboardCharts charts={engagementCharts} />
                  )}
                </PageSectionColumn>

                {/* Recently Updated */}
                <PageSectionColumn span={4} overflow>
                  <RecentArticlesColumn recentArticles={recentArticles} />
                </PageSectionColumn>
              </PageSectionColumns>
            ) : (
              <PageSectionColumns breakpoint="lg">
                {/* No Site yet, but articles exist — welcome takes the Sites +
                    Engagement columns' place, Recently Updated stays put. */}
                <PageSectionColumn span={8} overflow>
                  <SiteWelcome userName={userName} hasArticles={hasArticles} />
                </PageSectionColumn>
                <PageSectionColumn span={4} overflow>
                  <RecentArticlesColumn recentArticles={recentArticles} />
                </PageSectionColumn>
              </PageSectionColumns>
            )}
          </PageSection>
        ) : (
          /* Blank slate — no Site, no Article. Welcome replaces all three
             columns and isn't wrapped in a PageSectionColumn, so the
             PageSection itself needs to own scrolling (fill deliberately
             doesn't — see PageContainer's overflow/fill docs). */
          <PageSection overflow>
            <SiteWelcome userName={userName} hasArticles={hasArticles} />
          </PageSection>
        )}
      </PageContainer>

      {isDev && (
        <>
          <Modal
            isOpen={devToolsModal.isOpen}
            onClose={devToolsModal.close}
            title="Dev Tools"
            footer={null}
          >
            <div className={styles.devTools}>
              {isDev && (
                <>
                  <h3 className={styles.devToolsTitle}>Toast Testing</h3>
                  <div className={styles.devToastButtons}>
                    <Button
                      onClick={() =>
                        addToast({
                          heading:
                            "This toast will self destruct in 5 seconds.",
                          content: "This is a test toast.",
                          variant: "primary",
                          expireTimeSeconds: 5,
                        })
                      }
                      variant="primary"
                    >
                      Add Toast
                    </Button>
                    <Button
                      onClick={() =>
                        addToast({
                          heading:
                            "This toast will self destruct in 15 seconds.",
                          content: "This is another test toast.",
                          variant: "secondary",
                          expireTimeSeconds: 15,
                        })
                      }
                      variant="secondary"
                    >
                      Add Secondary Toast
                    </Button>
                    <Button
                      onClick={() =>
                        addToast({
                          heading:
                            "Warning! This toast will self destruct in 5 seconds.",
                          content: "Hot toast!",
                          variant: "danger",
                          expireTimeSeconds: 5,
                        })
                      }
                      variant="danger"
                    >
                      Add Danger Toast
                    </Button>
                    <Button
                      onClick={() =>
                        addToast({
                          heading: "Success! This toast expires in 10 seconds.",
                          content: "This is a success toast.",
                          variant: "success",
                          expireTimeSeconds: 10,
                        })
                      }
                      variant="success"
                    >
                      Add Success Toast
                    </Button>
                  </div>
                  <div className={styles.devToastButtons}>
                    <Button
                      onClick={() =>
                        addToast({
                          heading: "Primary Persisting Toast Message",
                          content: "This is a test toast.",
                          variant: "primary",
                          autoExpire: false,
                        })
                      }
                      variant="primary"
                    >
                      Primary Persisting Toast
                    </Button>
                    <Button
                      onClick={() =>
                        addToast({
                          heading: "Secondary Persisting Toast Message",
                          content: "This is another test toast.",
                          variant: "secondary",
                          autoExpire: false,
                        })
                      }
                      variant="secondary"
                    >
                      Secondary Persisting Toast
                    </Button>
                    <Button
                      onClick={() =>
                        addToast({
                          heading: "Danger Persisting Toast Message",
                          content: "Hot toast!",
                          variant: "danger",
                          autoExpire: false,
                        })
                      }
                      variant="danger"
                    >
                      Danger Persisting Toast
                    </Button>
                    <Button
                      onClick={() =>
                        addToast({
                          heading: "Success Persisting Toast Message",
                          content: "This success toast will not expire.",
                          variant: "success",
                          autoExpire: false,
                        })
                      }
                      variant="success"
                    >
                      Success Persisting Toast
                    </Button>
                  </div>
                </>
              )}

              <h3 className={styles.devToolsTitle}>Social</h3>
              <Button
                variant="danger"
                onClick={() => {
                  devToolsModal.close();
                  clearLikesModal.open();
                }}
                disabled={isClearLikesPending}
              >
                {isClearLikesPending ? "Clearing…" : "Clear All Likes"}
              </Button>

              {isDev && (
                <>
                  <h3 className={styles.devToolsTitle}>Data</h3>
                  <Button
                    variant="danger"
                    onClick={() => {
                      devToolsModal.close();
                      nukeModal.open();
                    }}
                    disabled={isNukePending}
                  >
                    {isNukePending ? "Nuking…" : "Nuke PDS Data"}
                  </Button>
                </>
              )}
            </div>
          </Modal>

          <Modal
            isOpen={clearLikesModal.isOpen}
            onClose={clearLikesModal.close}
            title="Clear All Likes"
            footer={
              <div className={styles.modalFooter}>
                <Button variant="secondary" onClick={clearLikesModal.close}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleClearLikesConfirm}>
                  Delete All Likes
                </Button>
              </div>
            }
          >
            <p>
              This will permanently delete all{" "}
              <code>{RECOMMEND_COLLECTION}</code> records from your PDS.
            </p>
            <p>This cannot be undone.</p>
          </Modal>

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
                  <Button variant="danger" onClick={handleNukeConfirm}>
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
      )}
    </>
  );
}
