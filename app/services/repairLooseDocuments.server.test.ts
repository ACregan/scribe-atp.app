import { describe, it, expect } from "vitest";
import { buildLoosePlan } from "./repairLooseDocuments.server";
import { buildLooseSiteUrl } from "./article.server";

const DID = "did:plc:e2lcgwxhymx3q6u7blziecdr";

function docRecord(rkey: string, value: Record<string, unknown>) {
  return {
    uri: `at://${DID}/site.standard.document/${rkey}`,
    cid: `${rkey}-cid`,
    value,
  };
}

describe("buildLooseSiteUrl", () => {
  it("builds a reader URL from the DID and document rkey", () => {
    expect(buildLooseSiteUrl(DID, "3mp47vxbfg226")).toBe(
      `https://reader.scribe-atp.app/${DID}/site.standard.document/3mp47vxbfg226`,
    );
  });
});

describe("buildLoosePlan", () => {
  it("skips documents still referenced by a site's manifest", () => {
    const documents = [docRecord("assigned1", { $type: "site.standard.document", scribe: {} })];
    const locationMap = new Map([["assigned1", [{ siteRkey: "site1", slug: "x", groupSlug: null, domain: "", basePath: "" }]]]);

    const plan = buildLoosePlan(documents, locationMap, DID);

    expect(plan.toRepair).toHaveLength(0);
    expect(plan.stillAssigned).toBe(1);
    expect(plan.alreadyLoose).toBe(0);
  });

  it("skips documents with no scribe extension (a different site.standard app's records)", () => {
    const documents = [docRecord("foreign1", { $type: "site.standard.document", title: "Not ours" })];
    const plan = buildLoosePlan(documents, new Map(), DID);

    expect(plan.toRepair).toHaveLength(0);
    expect(plan.skippedNonScribe).toBe(1);
  });

  it("flags an unassigned document that still carries a live at:// site URI", () => {
    const documents = [
      docRecord("leaky1", {
        $type: "site.standard.document",
        title: "Code Assistants",
        site: `at://${DID}/site.standard.publication/some-site`,
        path: "/code-assistants",
        publishedAt: "2026-06-02T10:33:30.142Z",
        scribe: { domain: "perpetualsummer.ltd", canonicalUrl: "https://perpetualsummer.ltd/code-assistants" },
      }),
    ];

    const plan = buildLoosePlan(documents, new Map(), DID);

    expect(plan.toRepair).toHaveLength(1);
    const item = plan.toRepair[0];
    expect(item.rkey).toBe("leaky1");
    expect(item.currentSite).toBe(`at://${DID}/site.standard.publication/some-site`);
    expect(item.newSite).toBe(`https://reader.scribe-atp.app/${DID}/site.standard.document/leaky1`);
    expect(item.newPath).toBe("/code-assistants");
    expect(item.hadPublishedAt).toBe(true);
    expect(item.hadCanonicalUrl).toBe(true);
    expect(item.hadScribeDomain).toBe(true);
  });

  it("flags an unassigned document with only publishedAt stale (site/canonicalUrl already recomputed by drag+Save Order)", () => {
    const documents = [
      docRecord("dragmoved1", {
        $type: "site.standard.document",
        title: "AI Agentic Coding Assistants",
        site: `at://${DID}/site.standard.publication/some-site`,
        path: "/ai-coding-assistants",
        publishedAt: "2026-07-06T15:09:34.995Z",
        scribe: { canonicalUrl: "https://anthonycregan.co.uk/ai-coding-assistants" },
      }),
    ];

    const plan = buildLoosePlan(documents, new Map(), DID);

    expect(plan.toRepair).toHaveLength(1);
    const item = plan.toRepair[0];
    expect(item.hadPublishedAt).toBe(true);
    expect(item.hadCanonicalUrl).toBe(true);
    expect(item.hadScribeDomain).toBe(false);
  });

  it("counts a document as already loose when all four fields already match the target state", () => {
    const rkey = "clean1";
    const documents = [
      docRecord(rkey, {
        $type: "site.standard.document",
        title: "Already Loose",
        site: buildLooseSiteUrl(DID, rkey),
        path: "/already-loose",
        scribe: {},
      }),
    ];

    const plan = buildLoosePlan(documents, new Map(), DID);

    expect(plan.toRepair).toHaveLength(0);
    expect(plan.alreadyLoose).toBe(1);
  });

  it("derives the new path from the current path's last segment, dropping any group prefix", () => {
    const documents = [
      docRecord("grouped1", {
        $type: "site.standard.document",
        title: "Was In A Group",
        site: `at://${DID}/site.standard.publication/some-site`,
        path: "/engineering/was-in-a-group",
        scribe: {},
      }),
    ];

    const plan = buildLoosePlan(documents, new Map(), DID);

    expect(plan.toRepair[0].newPath).toBe("/was-in-a-group");
  });

  it("handles multiple documents independently, tallying counts across the whole set", () => {
    const documents = [
      docRecord("a", { $type: "site.standard.document", scribe: {} }),
      docRecord("b", { $type: "site.standard.document", scribe: {}, site: buildLooseSiteUrl(DID, "b"), path: "/b" }),
      docRecord("c", { $type: "site.standard.document" }),
    ];
    const locationMap = new Map([["a", [{ siteRkey: "site1", slug: "a", groupSlug: "group1", domain: "x", basePath: "" }]]]);

    const plan = buildLoosePlan(documents, locationMap, DID);

    expect(plan.stillAssigned).toBe(1);
    expect(plan.alreadyLoose).toBe(1);
    expect(plan.skippedNonScribe).toBe(1);
    expect(plan.toRepair).toHaveLength(0);
  });
});
