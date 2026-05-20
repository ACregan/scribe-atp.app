import type { Route } from "./+types/sites";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Scribe ATP" },
    {
      name: "description",
      content: "Scribe ATP is a ATproto driven content management system.",
    },
  ];
}

export function HydrateFallback() {
  return <div>Loading...</div>;
}

export async function loader({ request }: Route.LoaderArgs) {
  const mockSiteData = [
    {
      domain: "norobots.blog",
      title: "NoRobots.blog",
    },
  ];
  return { sites: mockSiteData };
}

export default function Sites({ loaderData }: Route.ComponentProps) {
  const { sites } = loaderData;
  console.log("sites", sites);

  return (
    <>
      <h1>Sites</h1>
      <p>Manage the websites you are writing for here</p>
    </>
  );
}
