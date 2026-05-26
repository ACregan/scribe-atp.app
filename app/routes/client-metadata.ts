import type { Route } from "./+types/client-metadata";

const SCOPES = [
  "atproto",
  "repo:app.scribe.article?action=create",
  "repo:app.scribe.article?action=update",
  "repo:app.scribe.article?action=delete",
  "repo:app.scribe.group?action=create",
  "repo:app.scribe.group?action=update",
  "repo:app.scribe.group?action=delete",
  "repo:app.scribe.manifest?action=create",
  "repo:app.scribe.manifest?action=update",
  "repo:app.scribe.site?action=create",
  "repo:app.scribe.site?action=update",
  "repo:app.scribe.site?action=delete",
].join(" ");

export async function loader({}: Route.LoaderArgs) {
  const publicUrl = process.env.PUBLIC_URL ?? "https://scribe-atp.app";

  return new Response(
    JSON.stringify({
      client_id: `${publicUrl}/client-metadata.json?v=3`,
      client_name: "Scribe ATP",
      client_uri: publicUrl,
      redirect_uris: [`${publicUrl}/auth/callback`],
      scope: SCOPES,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
      dpop_bound_access_tokens: true,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
