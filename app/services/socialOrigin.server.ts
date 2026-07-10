import { logger } from "./logger.server";

// Registers a Site's domain with the social service's allowlist so its
// Like/Subscribe/Share buttons are accepted (see scribe-atp-social's
// allowed_origins table). Best-effort — a failure here must never block a
// Site create/configure action; the social service being briefly
// unreachable shouldn't stop someone from saving their Site.
export async function registerSocialOrigin(
  domain: string,
  did: string,
): Promise<void> {
  const notifySecret = process.env.NOTIFY_SECRET;
  if (!notifySecret) return;

  const socialServiceUrl =
    process.env.SOCIAL_SERVICE_URL ?? "https://social.scribe-atp.app";

  try {
    const res = await fetch(`${socialServiceUrl}/origins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${notifySecret}`,
      },
      body: JSON.stringify({ origin: `https://${domain}`, did }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn(
        {
          event: "social.origin_register_failed",
          domain,
          status: res.status,
        },
        "social origin registration failed",
      );
    }
  } catch (err) {
    logger.warn(
      { event: "social.origin_register_failed", domain, error: String(err) },
      "social origin registration failed",
    );
  }
}
