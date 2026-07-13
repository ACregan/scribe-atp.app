import { describe, it, expect } from "vitest";
import { buildHtmlClassRepairPlan } from "./repairArticleHtmlClasses.server";
import type { DocumentRecord } from "./documentRepository.server";

const DID = "did:plc:e2lcgwxhymx3q6u7blziecdr";

function docRecord(rkey: string, value: Record<string, unknown>): DocumentRecord {
  return {
    uri: `at://${DID}/site.standard.document/${rkey}`,
    cid: `${rkey}-cid`,
    rkey,
    value,
  };
}

describe("buildHtmlClassRepairPlan", () => {
  it("counts a document with no content field as already clean", () => {
    const plan = buildHtmlClassRepairPlan([docRecord("a1", { title: "No content" })]);
    expect(plan.toRepair).toHaveLength(0);
    expect(plan.alreadyClean).toBe(1);
  });

  it("counts a document whose HTML has no disallowed classes as already clean", () => {
    const plan = buildHtmlClassRepairPlan([
      docRecord("a1", {
        title: "Clean",
        content: { html: '<p>plain <a href="https://x.com">link</a></p>' },
      }),
    ]);
    expect(plan.toRepair).toHaveLength(0);
    expect(plan.alreadyClean).toBe(1);
  });

  it("flags a document whose HTML has CSS-Modules editor classes, listing what would be removed", () => {
    const plan = buildHtmlClassRepairPlan([
      docRecord("a1", {
        title: "Old article",
        content: {
          html: '<h1 class="_h1_v8vhs_415">Title</h1><p><strong class="_bold_v8vhs_375">bold</strong></p>',
        },
      }),
    ]);
    expect(plan.toRepair).toHaveLength(1);
    expect(plan.toRepair[0]).toEqual({
      rkey: "a1",
      title: "Old article",
      removedClasses: ["_bold_v8vhs_375", "_h1_v8vhs_415"],
    });
    expect(plan.alreadyClean).toBe(0);
  });

  it("does not flag Prism token classes required by @scribe-atp/styles", () => {
    const plan = buildHtmlClassRepairPlan([
      docRecord("a1", {
        title: "Code sample",
        content: {
          html: '<pre class="_codeBlock_v8vhs_454"><code><span class="token keyword">const</span></code></pre>',
        },
      }),
    ]);
    expect(plan.toRepair).toHaveLength(1);
    expect(plan.toRepair[0].removedClasses).toEqual(["_codeBlock_v8vhs_454"]);
  });

  it("processes multiple documents independently", () => {
    const plan = buildHtmlClassRepairPlan([
      docRecord("clean1", { title: "Clean", content: { html: "<p>hi</p>" } }),
      docRecord("dirty1", {
        title: "Dirty",
        content: { html: '<h2 class="_h2_v8vhs_420">Heading</h2>' },
      }),
    ]);
    expect(plan.alreadyClean).toBe(1);
    expect(plan.toRepair).toHaveLength(1);
    expect(plan.toRepair[0].rkey).toBe("dirty1");
  });
});
