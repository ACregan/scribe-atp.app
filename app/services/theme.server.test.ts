import { describe, it, expect } from "vitest";
import { getTheme, serializeThemeCookie } from "./theme.server";

function makeRequest(cookieHeader?: string): Request {
  return new Request("https://example.com", {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
}

describe("getTheme", () => {
  it("returns 'light' when no Cookie header is present", () => {
    expect(getTheme(makeRequest())).toBe("light");
  });

  it("returns 'dark' when theme=dark cookie is present", () => {
    expect(getTheme(makeRequest("theme=dark"))).toBe("dark");
  });

  it("returns 'light' when theme=light cookie is present", () => {
    expect(getTheme(makeRequest("theme=light"))).toBe("light");
  });

  it("returns 'light' for an unrecognised theme value", () => {
    expect(getTheme(makeRequest("theme=rainbow"))).toBe("light");
  });

  it("reads the theme cookie from a multi-cookie header", () => {
    expect(getTheme(makeRequest("session=abc; theme=dark; other=xyz"))).toBe(
      "dark",
    );
  });

  it("returns 'light' when a theme-prefixed sibling name is present but not 'theme'", () => {
    expect(getTheme(makeRequest("not-theme=dark"))).toBe("light");
  });

  it("returns 'light' when Cookie header is an empty string", () => {
    expect(getTheme(makeRequest(""))).toBe("light");
  });
});

describe("serializeThemeCookie", () => {
  it("includes the theme value for 'light'", () => {
    const cookie = serializeThemeCookie("light");
    expect(cookie).toContain("theme=light");
  });

  it("includes the theme value for 'dark'", () => {
    const cookie = serializeThemeCookie("dark");
    expect(cookie).toContain("theme=dark");
  });

  it("includes Path=/", () => {
    expect(serializeThemeCookie("light")).toContain("Path=/");
  });

  it("includes a Max-Age of one year", () => {
    const oneYear = 60 * 60 * 24 * 365;
    expect(serializeThemeCookie("light")).toContain(`Max-Age=${oneYear}`);
  });

  it("includes SameSite=Lax", () => {
    expect(serializeThemeCookie("dark")).toContain("SameSite=Lax");
  });
});
