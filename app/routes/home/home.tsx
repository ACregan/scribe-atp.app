import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const cookieHeader = request.headers.get("cookie");
  const cookies = new Map(
    (cookieHeader || "")
      .split(";")
      .map((c) => {
        const [key, value] = c.trim().split("=");
        return [key, value];
      })
  );

  const isAuthenticated = !!cookies.get("bsky_auth");

  return { isAuthenticated };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { isAuthenticated } = loaderData;

  return (
    <>
      <h1>Home Page</h1>
      <p>
        {isAuthenticated
          ? "Welcome to Scribe"
          : "User is NOT Authenticated"}
      </p>
    </>
  );
}
