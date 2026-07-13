import type { Route } from "./+types/core";
import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigation } from "react-router";
import {
  getAtpAgent,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";
import { getTheme } from "~/services/theme.server";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import styles from "./core.module.css";
import { Button } from "~/components/Button/Button";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import AsideMenu from "~/components/AsideMenu/AsideMenu";
import { ToastProvider } from "~/components/Toast/ToastContext";
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
    };
  }

  const agent = await getAtpAgent(did, request);
  const [sitesResult, documentsResult] = await Promise.all([
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

function CoreLayoutInner({ loaderData }: Route.ComponentProps) {
  const {
    isAuthenticated,
    displayName,
    avatar,
    handle,
    hasSites,
    hasArticles,
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
