import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@atproto/api";
import { createDocument } from "./documentRepository.server";

const DID = "did:plc:testuser";

function makeAgent(
  overrides: { createRecord?: ReturnType<typeof vi.fn> } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          createRecord: overrides.createRecord ?? vi.fn(),
        },
      },
    },
  } as unknown as Agent;
}

describe("createDocument", () => {
  it("passes the record through to createRecord and returns uri/cid", async () => {
    const createRecord = vi
      .fn()
      .mockResolvedValue({
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
