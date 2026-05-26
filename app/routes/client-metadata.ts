import type { Route } from "./+types/client-metadata";
import { OAUTH_SCOPE } from "~/services/auth.server";

export async function loader({}: Route.LoaderArgs) {
  const publicUrl = process.env.PUBLIC_URL ?? "https://scribe-atp.app";

  return new Response(
    JSON.stringify({
      client_id: `${publicUrl}/client-metadata.json?v=4`,
      client_name: "Scribe ATP",
      client_uri: publicUrl,
      redirect_uris: [`${publicUrl}/auth/callback`],
      scope: OAUTH_SCOPE,
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
