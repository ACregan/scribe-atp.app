import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Theme } from "~/services/theme.server";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const cookie = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/);
  if (cookie?.[1] === "dark") return "dark";
  if (cookie?.[1] === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function writeThemeCookie(theme: Theme): void {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `theme=${theme}; path=/; max-age=${maxAge}; samesite=lax`;
}

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme: Theme;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // On first hydration: if no theme cookie exists, resolve from prefers-color-scheme
  // and write the cookie so subsequent SSR loads get the right data-theme.
  useEffect(() => {
    const preferred = getPreferredTheme();
    if (preferred !== theme) {
      setTheme(preferred);
      document.documentElement.setAttribute("data-theme", preferred);
    }
    // Write cookie if absent so future SSR loads skip the inline script path.
    if (!document.cookie.match(/(?:^|;\s*)theme=/)) {
      writeThemeCookie(preferred);
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      writeThemeCookie(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
