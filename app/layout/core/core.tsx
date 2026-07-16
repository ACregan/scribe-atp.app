import type { Route } from "./+types/core";
import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigation, useFetcher } from "react-router";
import {
  getAtpAgent,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";
import { getTheme } from "~/services/theme.server";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import {
  listPendingInvitations,
  reconcileContributorStatuses,
  type PendingInvitation,
} from "~/services/contributorRoster.server";
import { listSites } from "~/services/siteRepository.server";
import { pendingSubmissions } from "~/services/db.server";
import { logger } from "~/services/logger.server";
import styles from "./core.module.css";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import AsideMenu from "~/components/AsideMenu/AsideMenu";
import { ToastProvider, useToast } from "~/components/Toast/ToastContext";
import { Spinner } from "~/components/Spinner/Spinner";
import { Toasts } from "~/components/Toast/Toast";
import DarkModeSwitch from "~/components/DarkModeSwitch/DarkModeSwitch";
import { ThemeProvider, useTheme } from "~/context/ThemeContext";
import Tooltip, { TooltipBubble } from "~/components/Tooltip/Tooltip";
import { version } from "../../../package.json";

type BskyProfile = {
  displayName?: string;
  avatar?: string;
  handle?: string;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { did, handle, isAuthenticated } = await getAuthSession(request);
  const theme = getTheme(request);

  if (!isAuthenticated || !did) {
    return {
      isAuthenticated: false,
      handle: null,
      displayName: null,
      avatar: null,
      theme,
      hasSites: false,
      hasArticles: false,
      pendingInvitations: [] as PendingInvitation[],
      pendingSubmissionsCount: 0,
      newSubmissions: [] as Array<{ documentUri: string; documentTitle: string }>,
    };
  }

  if (!useRealOAuth) {
    // Phase 4 — exercises the AsideMenu badge + new-submission toast without
    // a real PDS. Suppressed under E2E=true for the same reason the
    // invitations modal fixture is (see the pendingInvitations comment
    // below) — no e2e spec expects either.
    const devSubmission = {
      documentUri: `at://did:dev:owner/${DOCUMENT_COLLECTION}/dev-submission`,
      documentTitle: "A Contributor's Dev Submission",
    };
    return {
      isAuthenticated: true,
      handle,
      displayName: handle,
      avatar: null,
      theme,
      hasSites: true,
      hasArticles: true,
      // Dev fixture — exercises the Accept/Reject modal without a real PDS.
      // Suppressed under E2E=true: the modal is `isOpen` unconditionally
      // until dismissed, so it sat open and intercepted pointer events on
      // every authenticated page the E2E suite visits (46 unrelated specs
      // failed in CI this way) — no e2e spec exists that expects or
      // dismisses it, since this fixture predates any e2e coverage for the
      // Contributors feature.
      pendingInvitations: (process.env.E2E === "true"
        ? []
        : [
            {
              siteUri: `at://did:dev:owner/${SITE_COLLECTION}/dev-site`,
              siteTitle: "NoRobots.blog (Dev)",
              siteDomain: "norobots.blog",
            },
          ]) as PendingInvitation[],
      pendingSubmissionsCount: process.env.E2E === "true" ? 0 : 1,
      newSubmissions:
        process.env.E2E === "true"
          ? ([] as Array<{ documentUri: string; documentTitle: string }>)
          : [devSubmission],
    };
  }

  const agent = await getAtpAgent(did, request);
  const [ownedSites, documentsResult, pendingInvitations] = await Promise.all([
    listSites(agent, did),
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      limit: 1,
    }),
    // ADR 0019 Decision 6 — global, on-any-login discovery check, not tied
    // to a specific route or the DM link. No agent needed — this reads the
    // Owner's site record from the Owner's own PDS (resolved per-DID), not
    // the current user's, and public records need no auth.
    listPendingInvitations(did),
  ]);
  const hasSites = ownedSites.length > 0;
  const hasArticles = documentsResult.data.records.length > 0;

  // Found live 2026-07-16, Contributors Phase 2 test pass: reconciliation
  // was previously only triggered by visiting the *specific* site's own
  // /article/list/:siteSlug page — an Owner with no reason to click into
  // that exact page could leave scribe.contributors (the public record)
  // stale indefinitely. Running it here means the very next page the Owner
  // loads, anywhere, finalizes any pending accept/reject. Cheap in the
  // common case: reconcileContributorStatuses itself no-ops on a pure local
  // read when a site has nothing pending. This no longer gates Image
  // Library access — the Image Service reads contributor_memberships live
  // (ADR 0024) — it exists purely to keep the public PDS record correct.
  // Best-effort per site, matching every other reconciliation loop in this
  // feature — one failing site must never break every page load in the app.
  await Promise.allSettled(
    ownedSites.map(async (site) => {
      try {
        await reconcileContributorStatuses(agent, did, site.rkey);
      } catch (err) {
        logger.warn(
          {
            event: "contributor.global_reconciliation_failed",
            siteRkey: site.rkey,
            error: String(err),
          },
          "Owner-side contributor reconciliation failed — will retry on next page load",
        );
      }
    }),
  );

  // Phase 4 (discovery UX polish) — a purely local SQLite read, no network,
  // cheap to do on every page load. Powers both the AsideMenu/`/sites` badge
  // cascade (count) and the new-submission toast (client-side sessionStorage
  // dedup decides which of these are actually new to show).
  const pendingOwnerSubmissions = pendingSubmissions
    .listForOwner(did)
    .filter((s) => s.status === "pending");
  const pendingSubmissionsCount = pendingOwnerSubmissions.length;
  const newSubmissions = pendingOwnerSubmissions.map((s) => ({
    documentUri: s.documentUri,
    documentTitle: s.documentTitle,
  }));

  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`,
    );
    if (res.ok) {
      const profile = (await res.json()) as BskyProfile;
      return {
        isAuthenticated: true,
        handle: profile.handle ?? handle,
        displayName: profile.displayName ?? profile.handle ?? handle,
        avatar: profile.avatar ?? null,
        theme,
        hasSites,
        hasArticles,
        pendingInvitations,
        pendingSubmissionsCount,
        newSubmissions,
      };
    }
  } catch {
    // fall through
  }

  return {
    isAuthenticated: true,
    handle,
    displayName: handle,
    avatar: null,
    theme,
    hasSites,
    hasArticles,
    pendingInvitations,
    pendingSubmissionsCount,
    newSubmissions,
  };
}

interface HeaderButtonProps {
  url: string;
  children: React.ReactNode;
}

const HeaderButton: React.FC<HeaderButtonProps> = ({ url, children }) => {
  return (
    <Link to={url} target="_blank" className={styles.headerButtonLink}>
      <button className={styles.headerButton}>{children}</button>
    </Link>
  );
};

// ADR 0019 Decision 6 — global, on-any-authenticated-page Accept/Reject.
// Rendered inside <ToastProvider> (not directly in CoreLayoutInner) since
// useToast() must be called from a descendant of the provider, not the
// component that renders it. No dedicated route for this — the invite DM's
// link carries no identifying param; discovery is purely
// contributor_memberships rows against the logged-in DID (core.tsx's own
// loader), same data whether the invitee arrived via the DM link or logged
// in organically.
function PendingInvitationsModal({
  invitations,
}: {
  invitations: PendingInvitation[];
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const { addToast } = useToast();
  const [respondingUri, setRespondingUri] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const invitationKey = invitations.map((i) => i.siteUri).join(",");
  useEffect(() => {
    setDismissed(false);
  }, [invitationKey]);

  // Same "derive during render" pattern as site-list.tsx's
  // processedDeleteData — useEffect keyed on fetcher.data doesn't reliably
  // re-fire in this app's React Router version (see
  // feedback-usefetcher-data-effect-unreliable memory).
  const [processedData, setProcessedData] = useState(fetcher.data);
  if (
    fetcher.state === "idle" &&
    fetcher.data &&
    fetcher.data !== processedData
  ) {
    setProcessedData(fetcher.data);
    setRespondingUri(null);
    if (fetcher.data.ok) {
      addToast({ heading: "Response sent", variant: "success" });
    } else if (fetcher.data.error) {
      addToast({
        heading: "Something went wrong",
        content: fetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }

  if (invitations.length === 0 || dismissed) return null;
  const isResponding = fetcher.state !== "idle";

  function respond(siteUri: string, intent: "acceptInvitation" | "rejectInvitation") {
    setRespondingUri(siteUri);
    const formData = new FormData();
    formData.set("_intent", intent);
    formData.set("siteUri", siteUri);
    fetcher.submit(formData, {
      method: "post",
      action: "/contributor-invitations/respond",
    });
  }

  return (
    <Modal
      isOpen
      onClose={() => setDismissed(true)}
      title="Contributor Invitations"
      footer={null}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.6rem" }}>
        {invitations.map((invitation) => {
          const isThisResponding = isResponding && respondingUri === invitation.siteUri;
          return (
            <div
              key={invitation.siteUri}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1.2rem",
              }}
            >
              <p style={{ margin: 0 }}>
                You have been invited to contribute articles to{" "}
                <strong>{invitation.siteTitle || invitation.siteDomain}</strong>.
              </p>
              <div style={{ display: "flex", gap: "0.8rem", flexShrink: 0 }}>
                <Button
                  type="button"
                  variant="danger"
                  disabled={isResponding}
                  onClick={() => respond(invitation.siteUri, "rejectInvitation")}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  variant="success"
                  disabled={isResponding}
                  onClick={() => respond(invitation.siteUri, "acceptInvitation")}
                >
                  {isThisResponding ? "…" : "Accept"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// Phase 4 (discovery UX polish) — Owner-side non-expiring toast per new
// submission, deduped via sessionStorage so it doesn't re-fire on every
// visit while a submission is still pending (a pending_submissions row
// persists across many page loads until reviewed, unlike the Contributor-
// side reconciliation toast in list.tsx, which is self-consuming and needs
// no dedup at all). Rendered inside <ToastProvider>, same reasoning as
// PendingInvitationsModal above.
const SUBMISSION_TOAST_STORAGE_KEY = "scribe-toasted-submission-uris";

export function NewSubmissionToasts({
  submissions,
}: {
  submissions: Array<{ documentUri: string; documentTitle: string }>;
}) {
  const { addToast } = useToast();
  const key = submissions
    .map((s) => s.documentUri)
    .sort()
    .join(",");

  useEffect(() => {
    if (submissions.length === 0) return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(
        sessionStorage.getItem(SUBMISSION_TOAST_STORAGE_KEY) ?? "[]",
      );
    } catch {
      seen = [];
    }
    const seenSet = new Set(seen);
    const newOnes = submissions.filter((s) => !seenSet.has(s.documentUri));
    if (newOnes.length === 0) return;

    for (const s of newOnes) {
      addToast({
        heading: "New article submission",
        content: `"${s.documentTitle}" is waiting for your review.`,
        variant: "primary",
        autoExpire: false,
      });
    }
    sessionStorage.setItem(
      SUBMISSION_TOAST_STORAGE_KEY,
      JSON.stringify([...seenSet, ...newOnes.map((s) => s.documentUri)]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

function CoreLayoutInner({ loaderData }: Route.ComponentProps) {
  const {
    isAuthenticated,
    displayName,
    avatar,
    handle,
    hasSites,
    hasArticles,
    pendingInvitations,
    pendingSubmissionsCount,
    newSubmissions,
  } = loaderData;
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";
  const { theme, toggleTheme } = useTheme();

  const [asideExpanded, setAsideExpanded] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("aside-expanded") === "true")
      setAsideExpanded(true);
  }, []);

  function handleToggleAside() {
    setAsideExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("aside-expanded", String(next));
      return next;
    });
  }

  const asideState = !isAuthenticated
    ? "hidden"
    : asideExpanded
      ? "expanded"
      : "collapsed";

  return (
    <ToastProvider>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      <div
        className={styles.coreLayout_container}
        data-aside-state={asideState}
      >
        <header className={styles.coreHeader}>
          <div className={styles.leftAlignedItems}>
            <Tooltip
              anchorName="app-version"
              anchorPosition="right"
              anchorContent={<span className={styles.version}>v{version}</span>}
            >
              <div className={styles.logoContainer}>
                <SvgIcon
                  className={styles.headingLogo}
                  name={SvgImageList.ScribeCMSLogo}
                />
                {/* <h6>
                  Powered By{" "}
                  <span>
                    <SvgIcon
                      name={SvgImageList.ATProtoLogo}
                      fill={"var(--text-secondary)"}
                    />
                  </span>
                </h6> */}
              </div>
            </Tooltip>
            <div className={styles.linkButtonContainer}>
              <HeaderButton url={"https://docs.scribe-atp.app/"}>
                <SvgIcon name={SvgImageList.OpenInNewTab} />
                Docs
              </HeaderButton>
              <HeaderButton url={"https://reader.scribe-atp.app/"}>
                <SvgIcon name={SvgImageList.OpenInNewTab} />
                Reader
              </HeaderButton>
              <HeaderButton url={"https://www.npmjs.com/org/scribe-atp"}>
                <SvgIcon name={SvgImageList.OpenInNewTab} />
                SDK
              </HeaderButton>
            </div>
          </div>
          <div className={styles.rightAlignedItems}>
            {isAuthenticated ? (
              <div className={styles.userContainer}>
                <div className={styles.userProfile}>
                  <div className={styles.userName}>
                    <span className={styles.displayName}>{displayName}</span>
                    <span className={styles.handle}>@{handle}</span>
                  </div>
                  {avatar && (
                    <img
                      src={avatar}
                      alt={displayName ?? handle ?? ""}
                      className={styles.userAvatar}
                    />
                  )}
                </div>
              </div>
            ) : location.pathname !== "/login" && location.pathname !== "/" ? (
              <Link to="/login">
                <Button type="button" variant="primary">
                  LOGIN
                </Button>
              </Link>
            ) : null}
            <DarkModeSwitch
              toggleDarkMode={toggleTheme}
              darkMode={theme === "dark"}
            />
          </div>
        </header>
        {isAuthenticated && (
          <AsideMenu
            expanded={asideExpanded}
            onToggle={handleToggleAside}
            hasSites={hasSites}
            hasArticles={hasArticles}
            pendingSubmissionsCount={pendingSubmissionsCount}
          />
        )}
        <main id="main-content">
          {isNavigating && <Spinner overlay />}
          <Outlet />
        </main>
        <footer id="footer-portal-element"></footer>
      </div>
      <Toasts />
      <PendingInvitationsModal invitations={pendingInvitations} />
      <NewSubmissionToasts submissions={newSubmissions} />
    </ToastProvider>
  );
}

export default function CoreLayout(props: Route.ComponentProps) {
  return (
    <ThemeProvider initialTheme={props.loaderData.theme}>
      <CoreLayoutInner {...props} />
    </ThemeProvider>
  );
}
