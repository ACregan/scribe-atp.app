import type { Route } from "./+types/client-metadata";
import { OAUTH_SCOPE, OAUTH_METADATA_STATIC, PUBLIC_URL_DEFAULT } from "~/services/auth.server";

export async function loader({}: Route.LoaderArgs) {
  const publicUrl = process.env.PUBLIC_URL ?? PUBLIC_URL_DEFAULT;

  return new Response(
    JSON.stringify({
      client_id: `${publicUrl}/client-metadata.json`,
      client_name: "Scribe ATP",
      client_uri: publicUrl,
      redirect_uris: [`${publicUrl}/auth/callback`],
      scope: OAUTH_SCOPE,
      ...OAUTH_METADATA_STATIC,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
