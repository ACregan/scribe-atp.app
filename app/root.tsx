import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import "./styles/colours.css";
import "./styles/tokens.css";
import "./styles/typography.css";
import "./styles/app.css";
import "./styles/scrollbars.css";

import { randomBytes } from "node:crypto";
import type { Route } from "./+types/root";
import { getTheme } from "./services/theme.server";
import type { Theme } from "./services/theme.server";

export async function loader({ request }: Route.LoaderArgs) {
  const theme = getTheme(request);
  const nonce = randomBytes(16).toString("base64");
  return { theme, nonce };
}

export function meta({}: Route.MetaArgs) {
  return [{ name: "apple-mobile-web-app-title", content: "ScribeCMS" }];
}

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: "/fonts/Inter/inter.css" },
  // FAVICONS
  {
    rel: "icon",
    type: "image/png",
    sizes: "96x96",
    href: "/favicon-96x96.png",
  },
  {
    rel: "icon",
    type: "image/svg+xml",
    href: "/favicon.svg",
  },
  {
    rel: "shortcut icon",
    href: "/favicon.ico",
  },
  {
    rel: "apple-touch-icon",
    sizes: "180x180",
    href: "/apple-touch-icon.png",
  },
  {
    rel: "manifest",
    href: "/site.webmanifest",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<{ theme: Theme; nonce: string }>("root");
  const theme = data?.theme ?? "light";
  const nonce = data?.nonce ?? "";

  return (
    <html lang="en" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {/* Applies prefers-color-scheme on the very first visit before the
            theme cookie exists, preventing a flash of the wrong theme.
            Nonce matches CSP script-src so this inline script is allowed. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(!document.cookie.match(/(?:^|;\\s*)theme=/)){var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;if(dark){document.documentElement.setAttribute('data-theme','dark');}}}catch(e){}})();`,
          }}
        />
        {import.meta.env.PROD && (
          <script
            defer
            src="https://analytics.perpetualsummer.ltd/script.js"
            data-website-id="26af3d1e-1b9a-4d53-9d97-52d352aab090"
          />
        )}
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
