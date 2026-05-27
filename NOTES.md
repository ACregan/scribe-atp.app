# NOTES

### Cloudflare tunnel setup

1. Start the tunnel

```
npx cloudflared tunnel --url http://localhost:5173
```

It prints a generated HTTPS URL like https://abc123.trycloudflare.com. Keep this terminal running alongside your dev server.

2. Set env vars in .env

```
DEV_USE_REAL_OAUTH="true"
PUBLIC_URL="https://abc123.trycloudflare.com"
```

Then access the app via the tunnel URL (not localhost) — Bluesky needs to be able to fetch your client-metadata.json from that URL to verify the OAuth client, which it can't do if you're on localhost.

The catch: the tunnel URL changes every time you restart cloudflared, so you'd need to update PUBLIC_URL in .env each time. There are paid Cloudflare plans that give you a stable URL, but for occasional dev use the free ephemeral tunnel is fine.

This is required for the NUKE PDS DATA (dev only) Feature
Since you're currently running in dev bypass mode, the Nuke button is completely safe to use — it won't touch your live PDS data.
