import type { Route } from "./+types/protected";
import { Outlet } from "react-router";
import { requireAuth } from "~/services/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export default function ProtectedLayout() {
  return <Outlet />;
}
