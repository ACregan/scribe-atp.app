import { Agent } from "@atproto/api";
import { DOCUMENT_COLLECTION } from "~/constants";

// CRUD primitives for site.standard.document records. Sibling to
// siteRepository.server.ts (the equivalent for site.standard.publication).
// Built up incrementally as each route (create/list/configure/edit) migrates
// onto it.

export type DocumentRecord = {
  uri: string;
  cid: string;
  rkey: string;
  value: Record<string, unknown>;
};

export async function listDocuments(
  agent: Agent,
  did: string,
): Promise<DocumentRecord[]> {
  const records: DocumentRecord[] = [];
  let cursor: string | undefined;
  do {
    const result = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: DOCUMENT_COLLECTION,
      limit: 100,
      cursor,
    });
    records.push(
      ...result.data.records.map((r) => ({
        uri: r.uri,
        cid: r.cid,
        rkey: r.uri.split("/").pop()!,
        value: r.value as Record<string, unknown>,
      })),
    );
    cursor = result.data.cursor;
  } while (cursor);
  return records;
}

export async function getDocument(
  agent: Agent,
  did: string,
  rkey: string,
): Promise<{ cid: string | undefined; value: Record<string, unknown> }> {
  const result = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: DOCUMENT_COLLECTION,
    rkey,
  });
  return {
    cid: result.data.cid,
    value: result.data.value as Record<string, unknown>,
  };
}

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

export async function putDocument(
  agent: Agent,
  did: string,
  rkey: string,
  record: Record<string, unknown>,
  swapRecord?: string,
): Promise<{ cid: string }> {
  const result = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: DOCUMENT_COLLECTION,
    rkey,
    record,
    swapRecord,
  });
  return { cid: result.data.cid };
}

export async function deleteDocument(
  agent: Agent,
  did: string,
  rkey: string,
  swapRecord?: string,
): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: DOCUMENT_COLLECTION,
    rkey,
    swapRecord,
  });
}
