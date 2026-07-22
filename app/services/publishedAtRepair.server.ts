import type { Agent } from "@atproto/api";
import { listDocuments, putDocument } from "./documentRepository.server";
import { logger } from "./logger.server";

// One-time devtools repair. publishedAt is a mandatory datetime per the
// site.standard.document lexicon, but a bug (fixed alongside this route)
// let it be persisted as an empty string for any loose article ever saved
// via the edit form. This finds and repairs every document still carrying
// that "" value. Delete this route + this module once every known account
// has been repaired, per this repo's "chore: remove devtools/repair-*"
// convention.

export type ProposedPublishedAtRepair = {
  uri: string;
  rkey: string;
  title: string;
  after: string;
};

export type RepairPlan = {
  changes: ProposedPublishedAtRepair[];
};

export type ApplyResult = { rkey: string; ok: boolean; error?: string };

export async function buildRepairPlan(
  agent: Agent,
  did: string,
): Promise<RepairPlan> {
  const documents = await listDocuments(agent, did);
  const changes: ProposedPublishedAtRepair[] = [];

  for (const doc of documents) {
    if (doc.value.publishedAt !== "") continue;

    const scribe = (doc.value.scribe as Record<string, unknown>) ?? {};
    const after = String(
      scribe.createdAt ?? doc.value.updatedAt ?? new Date().toISOString(),
    );

    changes.push({
      uri: doc.uri,
      rkey: doc.rkey,
      title: String(doc.value.title ?? "Untitled"),
      after,
    });
  }

  return { changes };
}

export async function applyRepairPlan(
  agent: Agent,
  did: string,
  plan: RepairPlan,
): Promise<ApplyResult[]> {
  const documents = await listDocuments(agent, did);
  const byRkey = new Map(documents.map((d) => [d.rkey, d]));

  const results: ApplyResult[] = [];
  for (const change of plan.changes) {
    const doc = byRkey.get(change.rkey);
    if (!doc) {
      results.push({
        rkey: change.rkey,
        ok: false,
        error: "Record no longer exists",
      });
      continue;
    }
    try {
      await putDocument(
        agent,
        did,
        change.rkey,
        { ...doc.value, publishedAt: change.after },
        doc.cid,
      );
      results.push({ rkey: change.rkey, ok: true });
      logger.info(
        {
          event: "published_at_repair.document",
          user_did: did,
          rkey: change.rkey,
        },
        "published_at_repair.document",
      );
    } catch (err) {
      results.push({ rkey: change.rkey, ok: false, error: String(err) });
      logger.error(
        {
          event: "published_at_repair.document_failed",
          user_did: did,
          rkey: change.rkey,
          error: String(err),
        },
        "published_at_repair.document_failed",
      );
    }
  }
  return results;
}
