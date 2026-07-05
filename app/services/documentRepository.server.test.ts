import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@atproto/api";
import {
  createDocument,
  listDocuments,
  deleteDocument,
} from "./documentRepository.server";

const DID = "did:plc:testuser";

function makeAgent(
  overrides: {
    listRecords?: ReturnType<typeof vi.fn>;
    createRecord?: ReturnType<typeof vi.fn>;
    deleteRecord?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          listRecords: overrides.listRecords ?? vi.fn(),
          createRecord: overrides.createRecord ?? vi.fn(),
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
