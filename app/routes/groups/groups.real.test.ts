import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Agent } from "@atproto/api";
import { action } from "./groups";
import { requireAuth, getAtpAgent } from "~/services/auth.server";

// Characterization tests for the groups route's createGroup action
// (real-OAuth path). This action hand-rolls its own slug validation instead
// of calling siteManifest.server's validateGroupFields — see
// backlog-cms-reactrouter-review memory finding #12 — so it needs its own
// coverage for the reserved-slug fix (finding #4) rather than relying on
// siteManifest.server.test.ts.

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  getAtpAgent: vi.fn(),
  useRealOAuth: true,
}));

const DID = "did:plc:testuser";
const SITE_SLUG = "my-site";

function makeAgent(
  overrides: {
    getRecord?: ReturnType<typeof vi.fn>;
    putRecord?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    com: {
      atproto: {
        repo: {
          getRecord:
            overrides.getRecord ??
            vi.fn().mockResolvedValue({
              data: {
                cid: "site-cid",
                value: { $type: "site.standard.publication", scribe: { groups: [] } },
              },
            }),
          putRecord:
            overrides.putRecord ?? vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    },
  } as unknown as Agent;
}

function callAction(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  const request = new Request("http://localhost/groups", {
    method: "POST",
    body: formData,
  });
  return action({ request } as unknown as Parameters<typeof action>[0]);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReset().mockResolvedValue({ did: DID, handle: DID });
  vi.mocked(getAtpAgent).mockReset();
});

describe("action — createGroup", () => {
  it("creates a group with a valid slug", async () => {
    const putRecord = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(getAtpAgent).mockResolvedValue(makeAgent({ putRecord }));

    const result = await callAction({
      _intent: "createGroup",
      siteRkey: SITE_SLUG,
      title: "Engineering",
    });

    expect(result).toEqual({ ok: true });
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          scribe: expect.objectContaining({
            groups: [{ slug: "engineering", title: "Engineering", articles: [] }],
          }),
        }),
      }),
    );
  });

  it("bug fix: rejects a duplicate slug with the same message the shared createGroup helper uses, not a hand-rolled one", async () => {
    // Regression for the reuse finding: this action used to hand-roll its
    // own getRecord/putRecord + duplicate-slug check with its own error
    // text ("...already exists on this site."), independently of
    // siteManifest.server.ts's createGroup ("...already exists.") — two
    // implementations of the same invariant, silently diverging. Now
    // delegates to the shared helper, so the message can't drift again.
    const getRecord = vi.fn().mockResolvedValue({
      data: {
        cid: "site-cid",
        value: {
          $type: "site.standard.publication",
          scribe: { groups: [{ slug: "engineering", title: "Engineering" }] },
        },
      },
    });
    const putRecord = vi.fn();
    vi.mocked(getAtpAgent).mockResolvedValue(makeAgent({ getRecord, putRecord }));

    const result = await callAction({
      _intent: "createGroup",
      siteRkey: SITE_SLUG,
      title: "Engineering",
    });

    expect(result).toEqual({ error: "A group with this name already exists." });
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("bug fix: rejects the reserved 'root' slug before ever touching the PDS", async () => {
    const getRecord = vi.fn();
    const putRecord = vi.fn();
    vi.mocked(getAtpAgent).mockResolvedValue(makeAgent({ getRecord, putRecord }));

    const result = await callAction({
      _intent: "createGroup",
      siteRkey: SITE_SLUG,
      title: "Root",
    });

    expect(result).toEqual({ error: expect.stringContaining("reserved") });
    expect(getRecord).not.toHaveBeenCalled();
    expect(putRecord).not.toHaveBeenCalled();
  });

  it("bug fix: rejects an explicit slug of 'root' even with a different title", async () => {
    const result = await callAction({
      _intent: "createGroup",
      siteRkey: SITE_SLUG,
      title: "Top Level Stuff",
      slug: "root",
    });

    expect(result).toEqual({ error: expect.stringContaining("reserved") });
  });
});
