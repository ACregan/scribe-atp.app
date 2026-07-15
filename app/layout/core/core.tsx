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
  type PendingInvitation,
} from "~/services/contributorRoster.server";
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
    };
  }

  if (!useRealOAuth) {
    return {
      isAuthenticated: true,
      handle,
      displayName: handle,
      avatar: null,
      theme,
      hasSites: true,
      hasArticles: true,
      // Dev fixture — exercises the Accept/Reject modal without a real PDS.
      pendingInvitations: [
        {
          siteUri: `at://did:dev:owner/${SITE_COLLECTION}/dev-site`,
          siteTitle: "NoRobots.blog (Dev)",
          siteDomain: "norobots.blog",
        },
      ] as PendingInvitation[],
    };
  }

  const agent = await getAtpAgent(did, request);
  const [sitesResult, documentsResult, pendingInvitations] = await Promise.all([
    agent.com.atproto.repo.listRecords({
      repo: did,
      collection: SITE_COLLECTION,
      limit: 1,
    }),
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
  const hasSites = sitesResult.data.records.length > 0;
  const hasArticles = documentsResult.data.records.length > 0;

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

function CoreLayoutInner({ loaderData }: Route.ComponentProps) {
  const {
    isAuthenticated,
    displayName,
    avatar,
    handle,
    hasSites,
    hasArticles,
    pendingInvitations,
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
