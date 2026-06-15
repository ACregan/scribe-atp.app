import type { Route } from "./+types/login";
import { Form, Link, useSearchParams } from "react-router";
import { redirect } from "react-router";
import { Input } from "~/components/Input/Input";
import { Button } from "~/components/Button/Button";
import {
  createAuthSession,
  oauthClient,
  useRealOAuth,
  OAUTH_SCOPE,
} from "~/services/auth.server";
import { loginAttempts } from "~/services/db.server";
import { logger } from "~/services/logger.server";
import styles from "./login.module.css";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Scribe ATP - Login" },
    {
      name: "description",
      content:
        "Scribe ATP is a ATproto driven content management system. Login To Continue.",
    },
  ];
}

export async function loader() {
  return { isBypass: !useRealOAuth };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const handle = formData.get("bskyHandle");

  if (!handle || typeof handle !== "string") {
    return { error: "A Bluesky handle is required." };
  }

  const cleanHandle = handle.trim().replace(/^@/, "");

  if (!useRealOAuth) {
    return createAuthSession(
      request,
      { did: `did:dev:${cleanHandle}`, handle: cleanHandle },
      "/",
    );
  }

  const ip =
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ?? "unknown";

  if (loginAttempts.isLimited(ip)) {
    logger.warn({ event: "auth.login_attempt", ip, handle: cleanHandle, outcome: "blocked" }, "auth.login_attempt");
    return { error: "Too many login attempts. Please try again in 15 minutes." };
  }

  loginAttempts.record(ip);

  try {
    const authUrl = await oauthClient.authorize(cleanHandle, {
      scope: OAUTH_SCOPE,
    });
    logger.info({ event: "auth.login_attempt", ip, handle: cleanHandle, outcome: "initiated" }, "auth.login_attempt");
    return redirect(authUrl.toString());
  } catch (err) {
    logger.warn({ event: "auth.login_attempt", ip, handle: cleanHandle, outcome: "error", error: String(err) }, "auth.login_attempt");
    console.error("Bluesky authorize error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to start login. Please try again.",
    };
  }
}

export default function Login({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const error =
    actionData?.error ??
    (searchParams.get("error") === "auth_failed"
      ? "Authentication failed. Please try again."
      : null);

  return (
    <div className={styles.loginWrapper}>
      <div className={styles.loginContainer}>
        <h1>Login</h1>
        {loaderData.isBypass && (
          <p style={{ color: "orange" }}>
            Dev mode: OAuth is bypassed. Any handle will be accepted.
          </p>
        )}
        <Form method="post" className={styles.loginForm}>
          <Input
            id="bskyHandle"
            type="text"
            name="bskyHandle"
            label="Bluesky Handle"
            placeholder="you.bsky.social"
            autoComplete="username"
            error={error ?? undefined}
          />
          <Button type="submit">
            <div className={styles.buttonContent}>
              <SvgIcon fill="white" name={SvgImageList.SocialBlueSky} />
              <span>Sign in with Bluesky</span>
            </div>
          </Button>
          <p className={styles.signUp}>
            Dont have a Bluesky account ?{" "}
            <Link to="https://bsky.app/">Sign Up Here</Link>
          </p>
        </Form>
      </div>
    </div>
  );
}
