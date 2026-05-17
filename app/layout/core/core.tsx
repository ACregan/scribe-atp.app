import type { Route } from "./+types/core";
import { Form, Link, Outlet, useLocation } from "react-router";
import { getAuthSession, useRealOAuth } from "~/services/auth.server";
import styles from "./core.module.css";
import { Button } from "~/components/Button/Button";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";

type BskyProfile = {
  displayName?: string;
  avatar?: string;
  handle?: string;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { did, handle, isAuthenticated } = await getAuthSession(request);
  if (!isAuthenticated || !did) {
    return {
      isAuthenticated: false,
      handle: null,
      displayName: null,
      avatar: null,
    };
  }

  if (!useRealOAuth) {
    return { isAuthenticated: true, handle, displayName: handle, avatar: null };
  }

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
      };
    }
  } catch {
    // fall through
  }

  return { isAuthenticated: true, handle, displayName: handle, avatar: null };
}

export default function CoreLayout({ loaderData }: Route.ComponentProps) {
  const { isAuthenticated, displayName, avatar, handle } = loaderData;
  console.log("core loaderData", loaderData);
  const location = useLocation();

  return (
    <div className={styles.coreLayout_container}>
      <header>
        <div className={styles.logoContainer}>
          <h4>
            Scribe<span>CMS</span>
          </h4>
          <h6>
            Powered By{" "}
            <span>
              <SvgIcon name={SvgImageList.ATProtoLogo} />
            </span>
          </h6>
        </div>
        {isAuthenticated ? (
          <div className={styles.right}>
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
            <Form method="post" action="/logout">
              <Button type="submit" variant="danger">
                LOGOUT
              </Button>
            </Form>
          </div>
        ) : location.pathname !== "/login" ? (
          <Link to="/login">
            <Button type="button" variant="primary">
              LOGIN
            </Button>
          </Link>
        ) : null}
      </header>
      <main>
        <Outlet />
      </main>
      <footer></footer>
    </div>
  );
}
