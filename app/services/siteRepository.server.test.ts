import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@atproto/api";
import {
  listSites,
  getSite,
  createSite,
  putSite,
  deleteSite,
} from "./siteRepository.server";

const DID = "did:plc:testuser";

function makeAgent(
  overrides: {
    listRecords?: ReturnType<typeof vi.fn>;
    getRecord?: ReturnType<typeof vi.fn>;
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
          getRecord: overrides.getRecord ?? vi.fn(),
          createRecord: overrides.createRecord ?? vi.fn(),
          putRecord: overrides.putRecord ?? vi.fn(),
          deleteRecord: overrides.deleteRecord ?? vi.fn(),
        },
      },
    },
  } as unknown as Agent;
}

describe("listSites", () => {
  it("normalizes records to {uri, cid, rkey, value}", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({
        data: {
          records: [
            {
              uri: `at://${DID}/site.standard.publication/site-a`,
              cid: "cid-a",
              value: { scribe: { title: "A" } },
            },
          ],
        },
      }),
    });

    const result = await listSites(agent, DID);
    expect(result).toEqual([
      {
        uri: `at://${DID}/site.standard.publication/site-a`,
        cid: "cid-a",
        rkey: "site-a",
        value: { scribe: { title: "A" } },
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
              uri: `at://${DID}/site.standard.publication/a`,
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
              uri: `at://${DID}/site.standard.publication/b`,
              cid: "2",
              value: {},
            },
          ],
          cursor: undefined,
        },
      });
    const agent = makeAgent({ listRecords });

    const result = await listSites(agent, DID);
    expect(result.map((r) => r.rkey)).toEqual(["a", "b"]);
    expect(listRecords).toHaveBeenCalledTimes(2);
    expect(listRecords.mock.calls[1][0]).toEqual(
      expect.objectContaining({ cursor: "page2" }),
    );
  });

  it("returns an empty array when there are no records", async () => {
    const agent = makeAgent({
      listRecords: vi.fn().mockResolvedValue({ data: { records: [] } }),
    });
    expect(await listSites(agent, DID)).toEqual([]);
  });
});

describe("getSite", () => {
  it("returns the cid and value", async () => {
    const agent = makeAgent({
      getRecord: vi
        .fn()
        .mockResolvedValue({ data: { cid: "cid-a", value: { scribe: {} } } }),
    });
    expect(await getSite(agent, DID, "site-a")).toEqual({
      cid: "cid-a",
      value: { scribe: {} },
    });
  });
});

describe("createSite", () => {
  it("passes the record through to createRecord and returns uri/cid", async () => {
    const createRecord = vi
      .fn()
      .mockResolvedValue({
        data: { uri: `at://${DID}/site.standard.publication/a`, cid: "cid-a" },
      });
    const agent = makeAgent({ createRecord });

    const result = await createSite(agent, DID, { title: "A" });

    expect(createRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.publication",
      record: { title: "A" },
    });
    expect(result).toEqual({
      uri: `at://${DID}/site.standard.publication/a`,
      cid: "cid-a",
    });
  });
});

describe("putSite", () => {
  it("passes swapRecord through when provided", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({ putRecord });

    await putSite(agent, DID, "a", { title: "A" }, "old-cid");

    expect(putRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.publication",
      rkey: "a",
      record: { title: "A" },
      swapRecord: "old-cid",
    });
  });

  it("omits swapRecord when not provided", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: { cid: "new-cid" } });
    const agent = makeAgent({ putRecord });

    await putSite(agent, DID, "a", { title: "A" });

    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({ swapRecord: undefined }),
    );
  });
});

describe("deleteSite", () => {
  it("passes swapRecord through to deleteRecord", async () => {
    const deleteRecord = vi.fn().mockResolvedValue({ data: {} });
    const agent = makeAgent({ deleteRecord });

    await deleteSite(agent, DID, "a", "the-cid");

    expect(deleteRecord).toHaveBeenCalledWith({
      repo: DID,
      collection: "site.standard.publication",
      rkey: "a",
      swapRecord: "the-cid",
    });
  });
});
