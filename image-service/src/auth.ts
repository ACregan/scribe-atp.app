import { verifyScribeSession } from "../../shared/cookieSession.js";

export async function getSessionDid(
  cookieHeader: string | undefined,
): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return verifyScribeSession(cookieHeader, secret);
}
