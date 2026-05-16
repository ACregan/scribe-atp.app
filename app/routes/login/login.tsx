import { useState } from "react";
import type { Route } from "./+types/login";

const BSkyAuthorizeUrl = "https://bsky.social/oauth/authorize";
const defaultScopes = ["app.bsky.read", "app.bsky.write"];

function generateRandomString(length: number) {
  if (typeof crypto === "undefined") return "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => (byte % 36).toString(36)).join("");
}

function base64UrlEncode(buffer: ArrayBuffer) {
  if (typeof btoa === "undefined") return "";
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeChallenge(codeVerifier: string) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export const handle = { hydrate: false };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Login | Scribe ATP" },
    { name: "description", content: "Log in with BlueSky OAuth." },
  ];
}

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const clientId = import.meta.env.VITE_BSKY_CLIENT_ID ?? "";
  const redirectUri =
    import.meta.env.VITE_BSKY_REDIRECT_URI ??
    `${window.location.origin}/login/callback`;

  const handleLogin = async () => {
    if (!clientId) {
      setError(
        "Missing VITE_BSKY_CLIENT_ID. Please configure it in your environment.",
      );
      return;
    }

    try {
      const codeVerifier = generateRandomString(128);
      const codeChallenge = await createCodeChallenge(codeVerifier);
      const state = generateRandomString(32);

      sessionStorage.setItem("bsky_oauth_code_verifier", codeVerifier);
      sessionStorage.setItem("bsky_oauth_state", state);
      sessionStorage.setItem("bsky_oauth_redirect_uri", redirectUri);

      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: defaultScopes.join(" "),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      setIsRedirecting(true);
      window.location.href = `${BSkyAuthorizeUrl}?${params.toString()}`;
    } catch (err) {
      setError("Unable to start BlueSky OAuth flow. Please try again.");
      setIsRedirecting(false);
    }
  };

  return (
    <main style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Login with BlueSky</h1>
      <p>
        Authenticate with BlueSky using OAuth. You can configure the login flow
        using
        <code style={{ display: "block", marginTop: "0.5rem" }}>
          VITE_BSKY_CLIENT_ID
        </code>
        and an optional <code>VITE_BSKY_REDIRECT_URI</code>.
      </p>

      <button
        type="button"
        onClick={handleLogin}
        disabled={isRedirecting}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.9rem 1.4rem",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#fff",
          background: "#0f6ab4",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        {isRedirecting ? "Redirecting…" : "Continue with BlueSky"}
      </button>

      {error && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            borderRadius: 8,
            background: "#ffe5e5",
            color: "#9c1c1c",
          }}
        >
          {error}
        </div>
      )}
    </main>
  );
}
