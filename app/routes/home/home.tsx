import type { Route } from "./+types/home";
import { getAuthSession } from "~/services/auth.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Scribe ATP" },
    {
      name: "description",
      content: "Scribe ATP is a ATproto driven content management system.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { handle, isAuthenticated } = await getAuthSession(request);
  return { userName: handle ?? null, isAuthenticated };
}

export function HydrateFallback() {
  return <div>Loading...</div>;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { userName, isAuthenticated } = loaderData;
  return (
    <>
      <h1>Home Page</h1>
      <p>
        {userName} is {isAuthenticated == false && "NOT"} Authenticated
      </p>
    </>
  );
}
