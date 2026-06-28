import type { Route } from "./+types/logout";
import { destroyAuthSession } from "~/services/auth.server";

export async function action({ request }: Route.ActionArgs) {
  return destroyAuthSession(request, "/");
}
