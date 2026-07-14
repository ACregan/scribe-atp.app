import type { Route } from "./+types/protected";
import { Link, Outlet, isRouteErrorResponse } from "react-router";
import { requireAuth } from "~/services/auth.server";
import {
  PageContainer,
  PageContainerHeading,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export default function ProtectedLayout() {
  return <Outlet />;
}

// Bug fix: with no nested ErrorBoundary anywhere under the core layout, an
// error thrown by any protected route (e.g. a 404 for a missing article)
// bubbled all the way to root.tsx's boundary, which replaces the entire
// <Layout> content — discarding the persistent header, aside nav, and toast
// provider that every other page keeps. Catching it here instead means only
// the content area under this layout is replaced; core.tsx (an ancestor,
// unaffected by errors from its descendants) keeps rendering normally.
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const title = is404 ? "Not found" : "Something went wrong";
  const details = isRouteErrorResponse(error)
    ? error.statusText || (is404 ? "The requested page could not be found." : "")
    : import.meta.env.DEV && error instanceof Error
      ? error.message
      : "An unexpected error occurred.";

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Document}>
          {title}
        </PageContainerHeading>
      }
    >
      <p>{details}</p>
      <Link to="/">
        <Button type="button" variant="primary">
          Back to dashboard
        </Button>
      </Link>
    </PageContainer>
  );
}
