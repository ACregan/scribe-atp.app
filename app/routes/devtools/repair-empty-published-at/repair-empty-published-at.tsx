import type { Route } from "./+types/repair-empty-published-at";
import { useFetcher } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  buildRepairPlan,
  applyRepairPlan,
  type RepairPlan,
  type ApplyResult,
} from "~/services/publishedAtRepair.server";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { Spinner } from "~/components/Spinner/Spinner";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

// One-time devtools repair — see publishedAtRepair.server.ts for why. No
// admin gating, deliberately: the loader/action only ever read/write the
// caller's own documents via requireAtpAgent's agent, so it's inherently
// self-scoped regardless of who's logged in. Delete this route + its
// service module once every known account has been repaired, per this
// repo's "chore: remove devtools/repair-*" convention.

type RepairResult = { ok: true; results: ApplyResult[] } | { ok: false; error: string };

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as RepairPlan | null, devMode: true as const };
  }
  const { agent, did } = await requireAtpAgent(request);
  const plan = await buildRepairPlan(agent, did);
  return { plan, devMode: false as const };
}

export async function action({ request }: Route.ActionArgs): Promise<RepairResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }
  const { agent, did } = await requireAtpAgent(request);
  // Recompute rather than trust any client-submitted plan state.
  const plan = await buildRepairPlan(agent, did);
  const results = await applyRepairPlan(agent, did, plan);
  return { ok: true, results };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Repair Empty publishedAt — Scribe ATP" }];
}

export default function RepairEmptyPublishedAtPage({ loaderData }: Route.ComponentProps) {
  const { plan, devMode } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data as RepairResult | undefined;

  if (devMode) {
    return (
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Document}>
            Repair Empty publishedAt
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { changes } = plan!;
  const repaired = result?.ok ? result.results.filter((r) => r.ok).length : 0;
  const failed = result?.ok ? result.results.filter((r) => !r.ok) : [];

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Document}>
          Repair Empty publishedAt
        </PageContainerHeading>
      }
    >
      {result?.ok ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Repair complete
          </p>
          <p>
            {repaired} article{repaired !== 1 ? "s" : ""} repaired.
            {failed.length > 0 ? ` ${failed.length} failed — check server logs.` : ""}
          </p>
          {failed.map((f) => (
            <p key={f.rkey} style={{ color: "var(--action-danger)" }}>
              <code>{f.rkey}</code>: {f.error}
            </p>
          ))}
        </PageSection>
      ) : changes.length === 0 ? (
        <PageSection>
          <p>No articles have an empty publishedAt. Nothing to repair.</p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{changes.length}</strong> article{changes.length !== 1 ? "s" : ""} have an
              empty <code>publishedAt</code> and will be repaired.
            </p>
            {result?.ok === false && (
              <p style={{ color: "var(--action-danger)" }}>Error: {result.error}</p>
            )}
            <fetcher.Form method="post">
              <Button type="submit" variant="primary" disabled={isRunning}>
                {isRunning ? (
                  <>
                    <Spinner size="small" /> Repairing…
                  </>
                ) : (
                  "Run Repair"
                )}
              </Button>
            </fetcher.Form>
          </PageSection>

          {changes.map((change) => (
            <PageSection key={change.rkey}>
              <p>
                <strong>{change.title}</strong> — publishedAt will become{" "}
                <code>{change.after}</code>
              </p>
            </PageSection>
          ))}
        </>
      )}
    </PageContainer>
  );
}
