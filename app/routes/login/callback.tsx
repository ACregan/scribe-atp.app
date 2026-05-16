import { Link, redirect } from "react-router";
import type { Route } from "./+types/callback";

const tokenUrl = "https://bsky.social/oauth/token";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "BlueSky OAuth Callback" },
    {
      name: "description",
      content: "Handle BlueSky OAuth callback and complete login.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new Response("Missing authorization code or state", { status: 400 });
  }

  // Get stored values from cookies
  const cookieHeader = request.headers.get("cookie");
  const cookies = new Map(
    (cookieHeader || "").split(";").map((c) => {
      const [key, value] = c.trim().split("=");
      return [key, value];
    }),
  );

  const storedState = cookies.get("bsky_state");
  const codeVerifier = cookies.get("bsky_code_verifier");

  if (!storedState || state !== storedState) {
    throw new Response("OAuth state mismatch. Please retry logging in.", {
      status: 400,
    });
  }

  if (!codeVerifier) {
    throw new Response(
      "Missing PKCE verifier. Please start the login flow again.",
      {
        status: 400,
      },
    );
  }

  const clientId = process.env.VITE_BSKY_CLIENT_ID;
  if (!clientId) {
    throw new Response("Missing VITE_BSKY_CLIENT_ID", { status: 500 });
  }

  const redirectUri =
    process.env.VITE_BSKY_REDIRECT_URI ||
    `${new URL(request.url).origin}/login/callback`;

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data?.error_description || data?.error || "Token exchange failed";
      throw new Error(errorMessage);
    }

    // Set session cookie with auth token
    const sessionCookie = `bsky_auth=${encodeURIComponent(JSON.stringify(data))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
    const clearCookies = [
      "bsky_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      "bsky_code_verifier=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    ];

    const responseHeaders = new Headers();
    responseHeaders.append("Set-Cookie", sessionCookie);
    clearCookies.forEach((cookie) => {
      responseHeaders.append("Set-Cookie", cookie);
    });

    return redirect("/", {
      headers: responseHeaders,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unable to complete login";
    throw new Response(errorMessage, { status: 401 });
  }
}

export default function BskyCallback() {
  return (
    <main style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>BlueSky OAuth Callback</h1>
      <p>Processing your login...</p>
    </main>
  );
}
