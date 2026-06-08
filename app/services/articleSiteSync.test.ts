import { describe, it, expect } from "vitest";
import {
  computeSiteAssignmentChanges,
  type SiteAssignmentChanges,
} from "./articleSiteSync.server";

describe("computeSiteAssignmentChanges", () => {
  it("no prior assignments → all new rkeys go to sitesToAdd", () => {
    const result = computeSiteAssignmentChanges([], ["a", "b"]);
    expect(result).toEqual<SiteAssignmentChanges>({
      sitesToAdd: ["a", "b"],
      sitesToRemove: [],
      sitesToSync: [],
    });
  });

  it("all assignments removed → all old rkeys go to sitesToRemove", () => {
    const result = computeSiteAssignmentChanges(["a", "b"], []);
    expect(result).toEqual<SiteAssignmentChanges>({
      sitesToAdd: [],
      sitesToRemove: ["a", "b"],
      sitesToSync: [],
    });
  });

  it("overlapping sets → correct three-way partition", () => {
    const result = computeSiteAssignmentChanges(["a", "b"], ["b", "c"]);
    expect(result.sitesToAdd).toEqual(["c"]);
    expect(result.sitesToRemove).toEqual(["a"]);
    expect(result.sitesToSync).toEqual(["b"]);
  });

  it("identical old and new → everything goes to sitesToSync", () => {
    const result = computeSiteAssignmentChanges(["a", "b"], ["a", "b"]);
    expect(result).toEqual<SiteAssignmentChanges>({
      sitesToAdd: [],
      sitesToRemove: [],
      sitesToSync: ["a", "b"],
    });
  });

  it("completely disjoint → nothing to sync", () => {
    const result = computeSiteAssignmentChanges(["a", "b"], ["c", "d"]);
    expect(result.sitesToAdd).toEqual(["c", "d"]);
    expect(result.sitesToRemove).toEqual(["a", "b"]);
    expect(result.sitesToSync).toEqual([]);
  });

  it("single site retained after slug rename → still goes to sitesToSync (not add+remove)", () => {
    // slug rename doesn't affect site assignment; the caller provides same rkey in both lists
    const result = computeSiteAssignmentChanges(["site-x"], ["site-x"]);
    expect(result.sitesToSync).toEqual(["site-x"]);
    expect(result.sitesToAdd).toEqual([]);
    expect(result.sitesToRemove).toEqual([]);
  });

  it("both inputs empty → all arrays empty", () => {
    const result = computeSiteAssignmentChanges([], []);
    expect(result).toEqual<SiteAssignmentChanges>({
      sitesToAdd: [],
      sitesToRemove: [],
      sitesToSync: [],
    });
  });
});
