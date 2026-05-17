import type { Route } from "./+types/core";
import { Form, Link, Outlet } from "react-router";
import {
  destroyAuthSession,
  getAuthSession,
  useRealOAuth,
} from "~/services/auth.server";
import styles from "./core.module.css";
import { Button } from "~/components/Button/Button";

type BskyProfile = {
  displayName?: string;
  avatar?: string;
  handle?: string;
};

export async function action({ request }: Route.ActionArgs) {
  return destroyAuthSession(request, "/login");
}

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
  return (
    <div className={styles.coreLayout_container}>
      <header>
        <div className={styles.logoContainer}>
          <h4>
            Scribe<span>CMS</span>
          </h4>
          <h6>
            Powered By <span>@ATprotocol</span>
          </h6>
        </div>
        {isAuthenticated ? (
          <div className={styles.right}>
            <div className={styles.userProfile}>
              {avatar && (
                <img
                  src={avatar}
                  alt={displayName ?? handle ?? ""}
                  className={styles.userAvatar}
                />
              )}
              <span className={styles.userName}>{displayName ?? handle}</span>
            </div>
            <Form method="post">
              <Button type="submit" variant="danger">
                LOGOUT
              </Button>
            </Form>
          </div>
        ) : (
          <Link to="/login">LOGIN</Link>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <footer></footer>
    </div>
  );
}
