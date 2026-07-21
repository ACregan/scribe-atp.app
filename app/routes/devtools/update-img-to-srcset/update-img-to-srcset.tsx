import type { Route } from "./+types/update-img-to-srcset";
import { useFetcher } from "react-router";
import { requireAtpAgent, useRealOAuth } from "~/services/auth.server";
import {
  buildMigrationPlan,
  applyMigrationPlan,
  type MigrationPlan,
  type ApplyResult,
} from "~/services/imageSrcsetMigration.server";
import {
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { Button } from "~/components/Button/Button";
import { Spinner } from "~/components/Spinner/Spinner";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";

// One-time devtools migration (ADR 0029 only made *new* editor image
// insertions get a srcset — this backfills every article written before
// that shipped). No admin gating, deliberately: the loader/action only
// ever read/write the caller's own documents via requireAtpAgent's agent,
// so it's inherently self-scoped regardless of who's logged in. Delete
// this route + imageSrcsetMigration.server.ts once every known account has
// been migrated, per this repo's "chore: remove devtools/repair-*"
// convention.

type MigrateResult = { ok: true; results: ApplyResult[] } | { ok: false; error: string };

export async function loader({ request }: Route.LoaderArgs) {
  if (!useRealOAuth) {
    return { plan: null as MigrationPlan | null, devMode: true as const };
  }
  const { agent, did } = await requireAtpAgent(request);
  const plan = await buildMigrationPlan(agent, did);
  return { plan, devMode: false as const };
}

export async function action({ request }: Route.ActionArgs): Promise<MigrateResult> {
  if (!useRealOAuth) {
    return { ok: false, error: "Not available in dev mode." };
  }
  const { agent, did } = await requireAtpAgent(request);
  // Recompute rather than trust any client-submitted plan state.
  const plan = await buildMigrationPlan(agent, did);
  const results = await applyMigrationPlan(agent, did, plan);
  return { ok: true, results };
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export function meta() {
  return [{ title: "Add srcset to Existing Articles — Scribe ATP" }];
}

export default function UpdateImgToSrcsetPage({ loaderData }: Route.ComponentProps) {
  const { plan, devMode } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const isRunning = fetcher.state !== "idle";
  const result = fetcher.data as MigrateResult | undefined;

  if (devMode) {
    return (
      <PageContainer
        title={
          <PageContainerHeading icon={SvgImageList.Image}>
            Add srcset to Existing Articles
          </PageContainerHeading>
        }
      >
        <PageSection>
          <p>Not available in dev mode.</p>
        </PageSection>
      </PageContainer>
    );
  }

  const { changes, totalImages } = plan!;
  const migrated = result?.ok ? result.results.filter((r) => r.ok).length : 0;
  const failed = result?.ok ? result.results.filter((r) => !r.ok) : [];

  return (
    <PageContainer
      title={
        <PageContainerHeading icon={SvgImageList.Image}>
          Add srcset to Existing Articles
        </PageContainerHeading>
      }
    >
      {result?.ok ? (
        <PageSection>
          <p style={{ color: "var(--action-primary)", fontWeight: 600 }}>
            Migration complete
          </p>
          <p>
            {migrated} article{migrated !== 1 ? "s" : ""} updated.
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
          <p>Every embedded image already has a srcset, or none are Scribe-hosted. Nothing to migrate.</p>
        </PageSection>
      ) : (
        <>
          <PageSection>
            <p>
              <strong>{totalImages}</strong> image{totalImages !== 1 ? "s" : ""} across{" "}
              <strong>{changes.length}</strong> article{changes.length !== 1 ? "s" : ""} will gain
              a <code>srcset</code>.
            </p>
            {result?.ok === false && (
              <p style={{ color: "var(--action-danger)" }}>Error: {result.error}</p>
            )}
            <fetcher.Form method="post">
              <Button type="submit" variant="primary" disabled={isRunning}>
                {isRunning ? (
                  <>
                    <Spinner size="small" /> Migrating…
                  </>
                ) : (
                  "Run Migration"
                )}
              </Button>
            </fetcher.Form>
          </PageSection>

          {changes.map((change) => (
            <PageSection key={change.rkey}>
              <p>
                <strong>{change.title}</strong> — {change.images.length} image
                {change.images.length !== 1 ? "s" : ""}
              </p>
              {change.images.map((img) => (
                <div key={img.filename} style={{ marginBottom: "1rem" }}>
                  <p style={{ margin: 0, fontSize: "0.85em", color: "var(--text-secondary)" }}>
                    {img.filename}
                  </p>
                  <pre
                    style={{
                      margin: "0.2rem 0",
                      padding: "0.4rem 0.8rem",
                      background: "var(--surface-input)",
                      color: "var(--action-danger)",
                      fontSize: "0.8em",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {img.beforeTag}
                  </pre>
                  <pre
                    style={{
                      margin: "0.2rem 0",
                      padding: "0.4rem 0.8rem",
                      background: "var(--surface-input)",
                      color: "var(--action-primary)",
                      fontSize: "0.8em",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {img.afterTag}
                  </pre>
                </div>
              ))}
            </PageSection>
          ))}
        </>
      )}
    </PageContainer>
  );
}
