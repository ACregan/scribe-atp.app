export type Theme = "light" | "dark";

const THEME_COOKIE = "theme";

export function getTheme(request: Request): Theme {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)theme=([^;]+)/);
  const value = match?.[1];
  return value === "dark" ? "dark" : "light";
}

export function serializeThemeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}
