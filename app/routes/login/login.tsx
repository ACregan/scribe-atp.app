import type { Route } from "./+types/login";
import { Form, useSearchParams } from "react-router";
import { redirect } from "react-router";
import {
  createAuthSession,
  oauthClient,
  useRealOAuth,
} from "~/services/auth.server";

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
      "/"
    );
  }

  try {
    const authUrl = await oauthClient.authorize(cleanHandle, {
      scope: "atproto",
    });
    return redirect(authUrl.toString());
  } catch (err) {
    console.error("Bluesky authorize error:", err);
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to start login. Please try again.",
    };
  }
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const error =
    actionData?.error ??
    (searchParams.get("error") === "auth_failed"
      ? "Authentication failed. Please try again."
      : null);

  return (
    <div>
      <h1>Login</h1>
      {loaderData.isBypass && (
        <p style={{ color: "orange" }}>
          Dev mode: OAuth is bypassed. Any handle will be accepted.
        </p>
      )}
      <Form method="post">
        <input
          type="text"
          name="bskyHandle"
          placeholder="you.bsky.social"
          autoComplete="username"
        />
        <button type="submit">Sign in with Bluesky</button>
      </Form>
      {error ? <p style={{ color: "red" }}>{error}</p> : null}
    </div>
  );
}
