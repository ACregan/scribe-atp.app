import { Agent } from "@atproto/api";
import { DOCUMENT_COLLECTION } from "~/constants";

// CRUD primitives for site.standard.document records. Sibling to
// siteRepository.server.ts (the equivalent for site.standard.publication).
// Built up incrementally as each route (create/list/configure/edit) migrates
// onto it — only createDocument exists so far.

export async function createDocument(
  agent: Agent,
  did: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  const result = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: DOCUMENT_COLLECTION,
    record,
  });
  return { uri: result.data.uri, cid: result.data.cid };
}
