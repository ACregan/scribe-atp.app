import type { Route } from "./+types/admin";
import { Outlet } from "react-router";
import { requireAdminAtpAgent } from "~/services/auth.server";

// Structural admin gate for everything under devtools/*. Each devtools
// route already calls requireAdminAtpAgent itself in both its loader and
// action — this middleware doesn't replace that, it's defense in depth:
// route-tree structure (not developer memory) now guarantees any future
// devtools route nested here is gated, even if its own author forgets the
// per-route call. Middleware (unlike a plain ancestor loader) runs for
// both loaders and actions on the matched chain, so it actually covers
// action/POST requests too — an ancestor loader alone would not (loaders
// only re-run after an action, for revalidation, never before it).
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }) => {
    await requireAdminAtpAgent(request);
  },
];

export default function AdminLayout() {
  return <Outlet />;
}
