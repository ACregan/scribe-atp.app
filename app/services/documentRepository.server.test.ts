import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@atproto/api";
import {
  createDocument,
  listDocuments,
  putDocument,
  deleteDocument,
} from "./documentRepository.server";

const DID = "did:plc:testuser";

function makeAgent(
  overrides: {
    listRecords?: ReturnType<typeof vi.fn>;
    createRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
    deleteRecord?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords: overrides.listRecords ?? vi.fn(),
          createRecord: overrides.createRecord ?? vi.fn(),
          putRecord: overrides.putRecord ?? vi.fn(),
          deleteRecord: overrides.deleteRecord ?? vi.fn(),
        },
      },
    },
  } as unknown as Agent;
}

describe("listDocuments", () => {
  it("normalizes records to {uri, cid, rkey, value}", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.document/a`,
              cid: "cid-a",
              value: { title: "A" },
            },
          ],
        },
      }),
    });

    expect(await listDocuments(agent, DID)).toEqual([
      {
        uri: `at://${DID}/site.standard.document/a`,
        cid: "cid-a",
        rkey: "a",
        value: { title: "A" },
      },
    ]);
  });

  it("follows the cursor across multiple pages", async () => {
    const listRecords = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.document/a`,
              cid: "1",
              value: {},
            },
          ],
          cursor: "page2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.document/b`,
              cid: "2",
              value: {},
            },
          ],
          cursor: undefined,
        },
      });
    const agent = makeAgent({ listRecords });

    const result = await listDocuments(agent, DID);
    expect(result.map((r) => r.rkey)).toEqual(["a", "b"]);
    expect(listRecords).toHaveBeenCalledTimes(2);
  });
});

describe("deleteDocument", () => {
  it("passes swapRecord through to deleteRecord", async () => {
    const deleteRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ deleteRecord });

    await deleteDocument(agent, DID, "a", "the-cid");

    expect(deleteRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.document",
      rkey: "a",
      swapRecord: "the-cid",
    });
  });

  it("omits swapRecord when not provided", async () => {
    const deleteRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ deleteRecord });

    await deleteDocument(agent, DID, "a");

    expect(deleteRecord).toHaveBeenCalledWith(
      expect.objectContaining({ swapRecord: undefined }),
    );
  });
});

describe("putDocument", () => {
  it("passes swapRecord through to putRecord", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({ putRecord });

    await putDocument(agent, DID, "a", { title: "A" }, "old-cid");

    expect(putRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.document",
      rkey: "a",
      record: { title: "A" },
      swapRecord: "old-cid",
    });
  });

  it("omits swapRecord when not provided", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({ putRecord });

    await putDocument(agent, DID, "a", { title: "A" });

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({ swapRecord: undefined }),
    );
  });
});

describe("createDocument", () => {
  it("passes the record through to createRecord and returns uri/cid", async () => {
    const createRecord = vi.fn().mockResolvedValue({
      data: { uri: `at://${DID}/site.standard.document/a`, cid: "cid-a" },
    });
    const agent = makeAgent({ createRecord });

    const result = await createDocument(agent, DID, { title: "A" });

    expect(createRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.document",
      record: { title: "A" },
    });
    expect(result).toEqual({
      uri: `at://${DID}/site.standard.document/a`,
      cid: "cid-a",
    });
  });
});
