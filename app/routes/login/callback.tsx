import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
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

export default function BskyCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("Completing BlueSky login...");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const storedState = sessionStorage.getItem("bsky_oauth_state");
    const codeVerifier = sessionStorage.getItem("bsky_oauth_code_verifier");
    const redirectUri =
      sessionStorage.getItem("bsky_oauth_redirect_uri") ??
      `${window.location.origin}/login/callback`;
    const clientId = import.meta.env.VITE_BSKY_CLIENT_ID ?? "";

    if (!code) {
      setStatus("error");
      setMessage("Missing authorization code in the callback URL.");
      return;
    }

    if (!state || !storedState || state !== storedState) {
      setStatus("error");
      setMessage("OAuth state mismatch. Please retry logging in.");
      return;
    }

    if (!codeVerifier) {
      setStatus("error");
      setMessage("Missing PKCE verifier. Please start the login flow again.");
      return;
    }

    if (!clientId) {
      setStatus("error");
      setMessage(
        "Missing VITE_BSKY_CLIENT_ID. Cannot exchange authorization code.",
      );
      return;
    }

    async function exchangeToken() {
      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code: code ?? "",
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier ?? "",
        });

        const response = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error_description ||
              data?.error ||
              "BlueSky token exchange failed.",
          );
        }

        sessionStorage.removeItem("bsky_oauth_state");
        sessionStorage.removeItem("bsky_oauth_code_verifier");
        sessionStorage.setItem("bsky_auth", JSON.stringify(data));

        setStatus("success");
        setMessage("BlueSky login completed successfully.");
      } catch (err) {
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message : "Unable to complete login.",
        );
      }
    }

    exchangeToken();
  }, [searchParams]);

  return (
    <main style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>BlueSky OAuth Callback</h1>
      <p>{message}</p>
      {status === "success" ? (
        <p>
          Your BlueSky session has been stored locally. Go back to the{" "}
          <Link to="/">home page</Link>.
        </p>
      ) : (
        <p>
          {status === "loading"
            ? "Please wait while we complete the login flow."
            : "If this error persists, return to the login page and try again."}
        </p>
      )}
    </main>
  );
}
