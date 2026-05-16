import { Form } from "react-router";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Login | Scribe ATP" },
    { name: "description", content: "Log in with BlueSky OAuth." },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const crypto = await import("crypto");

  function generateRandomString(length: number) {
    return crypto.randomBytes(length).toString("hex").slice(0, length);
  }

  async function createCodeChallenge(codeVerifier: string) {
    const hash = crypto.createHash("sha256").update(codeVerifier).digest();
    return hash
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  const clientId = process.env.VITE_BSKY_CLIENT_ID;
  if (!clientId) {
    return new Response("Missing VITE_BSKY_CLIENT_ID", { status: 500 });
  }

  const redirectUri =
    process.env.VITE_BSKY_REDIRECT_URI ||
    `${new URL(request.url).origin}/login/callback`;
  const defaultScopes = ["app.bsky.read", "app.bsky.write"];

  const codeVerifier = generateRandomString(128);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  // Store PKCE and state in cookies
  const cookies = [
    `bsky_code_verifier=${codeVerifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    `bsky_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  ];

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: defaultScopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://bsky.social/oauth/authorize?${params.toString()}`;

  const responseHeaders = new Headers({
    Location: authUrl,
  });

  cookies.forEach((cookie) => {
    responseHeaders.append("Set-Cookie", cookie);
  });

  return new Response(null, {
    status: 302,
    headers: responseHeaders,
  });
}

export default function Login() {
  return (
    <main style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Login with BlueSky</h1>
      <p>Authenticate with BlueSky using OAuth to access Scribe ATP.</p>

      <Form method="post">
        <button
          type="submit"
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
          Continue with BlueSky
        </button>
      </Form>
    </main>
  );
}
