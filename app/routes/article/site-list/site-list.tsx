import type { Route } from "./+types/site-list";
import {
  redirect,
  useFetcher,
  useBlocker,
  useNavigate,
  useLocation,
  Form,
  Link,
} from "react-router";
import {
  getAtpAgent,
  requireAuth,
  requireAtpAgent,
  rethrowIfRedirect,
  useRealOAuth,
} from "~/services/auth.server";
import { Button } from "~/components/Button/Button";
import { Pill } from "~/components/Pill/Pill";
import { Spinner } from "~/components/Spinner/Spinner";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import {
  ButtonGroupContainer,
  PageContainer,
  PageContainerHeading,
  PageSection,
} from "~/components/PageContainer/PageContainer";
import { ArticleItemPreview } from "~/components/ArticleItem/ArticleItem";
import GroupItem, {
  GroupItemPreview,
  type TreeArticle,
} from "~/components/GroupItem/GroupItem";
import GroupList from "~/components/GroupList/GroupList";
import { DndContext, DragOverlay, closestCorners } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState, useRef, useEffect } from "react";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { useToast } from "~/components/Toast/ToastContext";

import {
  DOCUMENT_COLLECTION,
  READER_BASE_URL,
  SITE_COLLECTION,
  SLUG_RE,
} from "~/constants";
import { listDocuments } from "~/services/documentRepository.server";
import { crossPostToBluesky } from "@scribe-atp/core";
import type { ArticleRef, SiteGroup, SiteContributor } from "~/hooks/types";
import { fetchBskyProfiles } from "~/services/blueskyProfile.server";
import {
  inviteContributor,
  removeContributor,
  reconcileContributorStatuses,
} from "~/services/contributorRoster.server";
import { pendingSubmissions } from "~/services/db.server";
import {
  type SiteManifest,
  type RosterEntry,
  type SubmissionListEntry,
  toSlug,
  treeToSiteData,
} from "./siteTree";
import { useDirtyTree } from "./useDirtyTree";
import { useSiteListDnD } from "./useSiteListDnD";
import { mutateSiteRecord } from "~/services/articleSiteSync.server";
import {
  createGroup as createGroupManifest,
  deleteGroup as deleteGroupManifest,
  unpublishArticle,
  removeArticleFromSite as removeArticleFromSiteManifest,
  saveSiteOrder,
  validateGroupFields,
} from "~/services/siteManifest.server";
import { resolveThumbUrl } from "~/services/article.server";
import { devSiteListLoader } from "~/services/devFixtures.server";
import { logger } from "~/services/logger.server";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import styles from "./site-list.module.css";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.site?.title ?? "Site";
  return [{ title: `Scribe ATP – ${title}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const siteSlug = params.siteSlug;

  if (!useRealOAuth) return devSiteListLoader(siteSlug);

  try {
    const { agent, did } = await requireAtpAgent(request);

    // ADR 0019 — Owner-side reconciliation: promote locally-accepted invites
    // and strip locally-rejected ones out of scribe.contributors, every time
    // the Owner visits this page. Cheap no-op when there's nothing pending.
    // core.tsx's global loop (every page, every owned site) also runs this,
    // so this call is a same-page belt-and-braces, not the sole trigger.
    await reconcileContributorStatuses(agent, did, siteSlug);

    const [record, documents] = await Promise.all([
      agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
      }),
      listDocuments(agent, did),
    ]);

    const value = record.data.value as Record<string, unknown>;
    const scribeVal = (value.scribe as Record<string, unknown>) ?? {};

    // ADR 0013: a document's own `site` field is the sole loose-vs-published
    // signal — a loose document's `site` is a reader URL, not an at:// URI.
    const hasUnassignedArticles = documents.some((d) =>
      String(d.value.site ?? "").startsWith(READER_BASE_URL),
    );

    // Phase 3 sub-pass 2 (ADR 0022 point 6) — read straight from the local
    // pending_submissions cache, no cross-repo read needed just to render a
    // title on this page. Filtered to this site and to still-pending rows —
    // a rejected row lingers locally until the Contributor's own
    // reconciliation (Phase 3c) acknowledges it, and isn't this Owner's to
    // act on again.
    const siteUri = `at://${did}/${SITE_COLLECTION}/${siteSlug}`;
    const submissions = pendingSubmissions
      .listForOwner(did)
      .filter((s) => s.siteUri === siteUri && s.status === "pending");

    const rosterEntries = (scribeVal.contributors as SiteContributor[]) ?? [];
    const profileDids = [
      ...new Set([
        ...rosterEntries.map((c) => c.did),
        ...submissions.map((s) => s.contributorDid),
      ]),
    ];
    const profiles = await fetchBskyProfiles(profileDids);
    const profileByDid = new Map(profiles.map((p) => [p.did, p]));
    const contributors: RosterEntry[] = rosterEntries.map((c) => ({
      ...c,
      handle: profileByDid.get(c.did)?.handle ?? c.did,
      displayName: profileByDid.get(c.did)?.displayName,
      avatar: profileByDid.get(c.did)?.avatar,
    }));

    const submissionRows: SubmissionListEntry[] = submissions.map((s) => ({
      contributorDid: s.contributorDid,
      rkey: s.documentUri.split("/").pop() ?? "",
      documentTitle: s.documentTitle,
      submittedAt: s.submittedAt,
      contributorHandle:
        profileByDid.get(s.contributorDid)?.handle ?? s.contributorDid,
      contributorDisplayName: profileByDid.get(s.contributorDid)?.displayName,
    }));

    return {
      devMode: false,
      hasUnassignedArticles,
      contributors,
      submissions: submissionRows,
      site: {
        rkey: siteSlug,
        cid: record.data.cid,
        url: String(scribeVal.domain ?? ""),
        title: String(scribeVal.title ?? ""),
        urlPrefix: String(scribeVal.basePath ?? ""),
        groups: (scribeVal.groups as SiteGroup[]) ?? [],
        ungroupedArticles: (scribeVal.ungroupedArticles as ArticleRef[]) ?? [],
      } as SiteManifest,
    };
  } catch (err) {
    rethrowIfRedirect(err);
    throw redirect("/sites");
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const { did } = await requireAuth(request);
  const siteSlug = params.siteSlug;
  const formData = await request.formData();
  const intent = formData.get("_intent") as string;

  if (intent === "createGroup") {
    const title = (formData.get("title") as string)?.trim();
    if (!title) return { error: "Group title is required." };
    const slugInput = formData.get("slug") as string;
    const validated = validateGroupFields(title, slugInput);
    if ("error" in validated) return validated;
    if (!useRealOAuth) return { ok: true };

    const agent = await getAtpAgent(did, request);
    return createGroupManifest(agent, did, siteSlug, {
      title,
      slug: validated.slug,
    });
  }

  if (intent === "deleteGroup") {
    const rkey = formData.get("rkey") as string;
    if (!rkey) return { ok: false, error: "Missing group ID." };
    if (!useRealOAuth) return { ok: true, deletedSlug: rkey };

    const agent = await getAtpAgent(did, request);
    return deleteGroupManifest(agent, did, siteSlug, rkey);
  }

  if (intent === "saveSite") {
    const siteDataJson = formData.get("siteData") as string;
    if (!siteDataJson) return { error: "No data." };
    if (!useRealOAuth) return { ok: true };

    const agent = await getAtpAgent(did, request);
    const { groups, ungroupedArticles } = JSON.parse(siteDataJson) as {
      groups: SiteGroup[];
      ungroupedArticles: ArticleRef[];
    };
    return saveSiteOrder(agent, did, siteSlug, { groups, ungroupedArticles });
  }

  if (intent === "removeArticle") {
    const uri = formData.get("uri") as string;
    if (!uri) return redirect(`/article/list/${siteSlug}`);

    if (useRealOAuth) {
      const agent = await getAtpAgent(did, request);
      await removeArticleFromSiteManifest(agent, did, siteSlug, uri);
    }

    return redirect(`/article/list/${siteSlug}`);
  }

  if (intent === "inviteContributor") {
    const contributorDid = (formData.get("contributorDid") as string)?.trim();
    if (!contributorDid) return { error: "No Bluesky account selected." };
    if (!useRealOAuth) return { ok: true };

    const agent = await getAtpAgent(did, request);
    return inviteContributor(agent, did, siteSlug, contributorDid);
  }

  if (intent === "removeContributor") {
    const contributorDid = formData.get("contributorDid") as string;
    if (!contributorDid) return { ok: false, error: "Missing contributor." };
    if (!useRealOAuth) return { ok: true, removedDid: contributorDid };

    const agent = await getAtpAgent(did, request);
    const result = await removeContributor(agent, did, siteSlug, contributorDid);
    return result.ok
      ? { ok: true, removedDid: contributorDid }
      : { ok: false, error: String(result.error) };
  }

  if (intent === "moveToDraft") {
    const uri = formData.get("uri") as string;
    if (!uri) return redirect(`/article/list/${siteSlug}`);

    if (useRealOAuth) {
      const agent = await getAtpAgent(did, request);
      await unpublishArticle(agent, did, siteSlug, uri);
    }

    return redirect(`/article/list/${siteSlug}`);
  }

  if (intent === "shareToBluesky") {
    const uri = formData.get("uri") as string;
    const text = formData.get("text") as string;
    if (!uri || !text) return { ok: false, error: "Missing required fields." };

    if (useRealOAuth) {
      try {
        const agent = await getAtpAgent(did, request);
        const rkey = uri.split("/").pop()!;

        const [docResult, siteResult] = await Promise.all([
          agent.com.atproto.repo.getRecord({
            repo: did,
            collection: DOCUMENT_COLLECTION,
            rkey,
          }),
          agent.com.atproto.repo.getRecord({
            repo: did,
            collection: SITE_COLLECTION,
            rkey: siteSlug,
          }),
        ]);

        const doc = docResult.data.value as Record<string, unknown>;
        const docScribe = (doc.scribe as Record<string, unknown>) ?? {};
        const canonicalUrl = String(docScribe.canonicalUrl ?? "");
        const title = String(doc.title ?? "");
        const description = doc.description
          ? String(doc.description)
          : undefined;
        const publicationUri = `at://${did}/${SITE_COLLECTION}/${siteSlug}`;
        const publicationCid = siteResult.data.cid;

        const coverImageUrl = String(docScribe.coverImageUrl ?? "");
        let coverImageBlobRef: unknown;
        if (coverImageUrl) {
          try {
            const thumbSrc = resolveThumbUrl(coverImageUrl);
            let imgRes = await fetch(thumbSrc);
            if (!imgRes.ok && thumbSrc !== coverImageUrl) {
              imgRes = await fetch(coverImageUrl);
            }
            if (imgRes.ok) {
              const imgBuffer = await imgRes.arrayBuffer();
              const mimeType =
                imgRes.headers.get("content-type") ?? "image/webp";
              const uploadRes = await agent.uploadBlob(
                new Uint8Array(imgBuffer),
                {
                  encoding: mimeType,
                },
              );
              coverImageBlobRef = uploadRes.data.blob;
            }
          } catch (blobErr) {
            logger.warn(
              {
                event: "article.share.cover_image_blob_error",
                error: String(blobErr),
              },
              "cover image blob upload failed — sharing without thumb",
            );
          }
        }

        const bskyPostRef = await crossPostToBluesky(agent, {
          did,
          documentUri: uri,
          documentCid: docResult.data.cid!,
          publicationUri,
          publicationCid: publicationCid!,
          canonicalUrl,
          title,
          text,
          description,
          thumbBlob: coverImageBlobRef,
        });

        await agent.com.atproto.repo.putRecord({
          repo: did,
          collection: DOCUMENT_COLLECTION,
          rkey,
          record: { ...doc, bskyPostRef, updatedAt: new Date().toISOString() },
          swapRecord: docResult.data.cid,
        });

        await mutateSiteRecord(agent, did, siteSlug, (val) => ({
          ...val,
          ungroupedArticles: (val.ungroupedArticles ?? []).map((a) =>
            a.uri === uri ? { ...a, bskyPostRef } : a,
          ),
          groups: (val.groups ?? []).map((g) => ({
            ...g,
            articles: (g.articles ?? []).map((a) =>
              a.uri === uri ? { ...a, bskyPostRef } : a,
            ),
          })),
          updatedAt: new Date().toISOString(),
        }));

        return { ok: true, uri, bskyPostRef };
      } catch (err) {
        rethrowIfRedirect(err);
        logger.error(
          { event: "article.share.error", error: String(err) },
          "article.share.error",
        );
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Share failed: ${message}` };
      }
    }

    return { ok: true, uri, bskyPostRef: null };
  }

  return redirect(`/article/list/${siteSlug}`);
}

function CreateGroupModal({
  onClose,
  siteUrl,
  urlPrefix,
}: {
  onClose: () => void;
  siteUrl: string;
  urlPrefix: string;
}) {
  const fetcher = useFetcher<{ error?: string }>();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const slugDirtyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isPending = fetcher.state !== "idle";
  const slugValid = slug === "" || SLUG_RE.test(slug);
  const composedPath = [siteUrl, urlPrefix, slug].filter(Boolean).join("/");

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) {
      onCloseRef.current();
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}
    >
      <input type="hidden" name="_intent" value="createGroup" />
      <Input
        id="group-title"
        name="title"
        label="Group title"
        placeholder="e.g. Engineering"
        value={title}
        onChange={(e) => {
          const value = e.target.value;
          setTitle(value);
          if (!slugDirtyRef.current) setSlug(toSlug(value));
        }}
        autoFocus
      />
      <Input
        id="group-slug"
        name="slug"
        label="URL path"
        placeholder="e.g. engineering"
        value={slug}
        onChange={(e) => {
          slugDirtyRef.current = true;
          setSlug(e.target.value.toLowerCase());
        }}
        error={
          !slugValid
            ? "Lowercase letters, numbers and hyphens only."
            : undefined
        }
      />
      {slug && slugValid && (
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          Path: <code>{composedPath}</code>
        </p>
      )}
      {fetcher.data?.error && (
        <p
          style={{
            fontSize: "1.3rem",
            color: "var(--action-danger)",
            margin: 0,
          }}
        >
          {fetcher.data.error}
        </p>
      )}
      <p
        style={{
          fontSize: "1.2rem",
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        The URL path cannot be changed after the group is created.
      </p>
      <Button
        type="submit"
        disabled={isPending || !title.trim() || !slug || !slugValid}
      >
        {isPending ? "Creating…" : "Create Group"}
      </Button>
    </fetcher.Form>
  );
}

type ResolvedProfile = {
  did: string;
  handle: string;
  displayName: string;
  avatar?: string;
};
type ResolveResult = ResolvedProfile | { error: string };

// Modal for adding someone to this site's Contributor roster (ADR 0014/0018/
// 0019). Handle-resolution half mirrors AddContributorModal (the document-
// level byline feature's existing lookup flow) — reused rather than building
// a second lookup pattern — but unlike that modal, "Send Invite" is a real
// server write (scribe.contributors + contributor_memberships), not local
// component state staged for a later form save.
function InviteContributorModal({
  isOpen,
  onClose,
  existingDids,
}: {
  isOpen: boolean;
  onClose: () => void;
  existingDids: string[];
}) {
  const [handle, setHandle] = useState("");
  const [hasLookedUp, setHasLookedUp] = useState(false);
  const resolveFetcher = useFetcher<ResolveResult>();
  const inviteFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    setHandle("");
    setHasLookedUp(false);
  }, [isOpen]);

  // Mirrors CreateGroupModal's close-on-success effect above — this pattern
  // is already proven to work in this file for a modal+fetcher submission.
  useEffect(() => {
    if (
      inviteFetcher.state === "idle" &&
      inviteFetcher.data &&
      !inviteFetcher.data.error
    ) {
      onCloseRef.current();
    }
  }, [inviteFetcher.state, inviteFetcher.data]);

  const resolved =
    hasLookedUp && resolveFetcher.data && "did" in resolveFetcher.data
      ? resolveFetcher.data
      : null;
  const resolveError =
    hasLookedUp && resolveFetcher.data && "error" in resolveFetcher.data
      ? resolveFetcher.data.error
      : null;

  const isResolving = resolveFetcher.state !== "idle";
  const isInviting = inviteFetcher.state !== "idle";
  const alreadyOnRoster = resolved
    ? existingDids.includes(resolved.did)
    : false;
  const canInvite = resolved !== null && !alreadyOnRoster && !isInviting;

  function handleLookup() {
    if (!handle.trim()) return;
    setHasLookedUp(true);
    resolveFetcher.load(
      `/article/resolve-contributor?handle=${encodeURIComponent(handle.trim())}`,
    );
  }

  function handleInvite() {
    if (!resolved || !canInvite) return;
    const formData = new FormData();
    formData.set("_intent", "inviteContributor");
    formData.set("contributorDid", resolved.did);
    inviteFetcher.submit(formData, { method: "post" });
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite Contributor"
      footer={
        <div
          style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="success"
            disabled={!canInvite}
            onClick={handleInvite}
          >
            {isInviting ? "Sending…" : "Send Invite"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
        <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-end" }}>
          <Input
            id="invite-contributor-handle"
            label="Bluesky handle"
            placeholder="e.g. alice.bsky.app"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLookup();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!handle.trim() || isResolving}
            onClick={handleLookup}
            className={styles.lookupButton}
          >
            {isResolving ? "Looking up…" : "Look up"}
          </Button>
        </div>

        {resolveError && (
          <p style={{ color: "var(--action-danger)", margin: 0 }}>
            {resolveError}
          </p>
        )}
        {inviteFetcher.data?.error && (
          <p style={{ color: "var(--action-danger)", margin: 0 }}>
            {inviteFetcher.data.error}
          </p>
        )}

        {resolved && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
            {resolved.avatar && (
              <img
                src={resolved.avatar}
                alt=""
                style={{
                  width: "3.2rem",
                  height: "3.2rem",
                  borderRadius: "50%",
                }}
              />
            )}
            <span>{resolved.displayName}</span>
            <span style={{ color: "var(--text-secondary)" }}>
              @{resolved.handle}
            </span>
            {alreadyOnRoster && (
              <p style={{ color: "var(--action-danger)", margin: 0 }}>
                This person is already on the roster for this site.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ShareModal({
  article,
}: {
  article: {
    uri: string;
    title: string;
    bskyPostRef: { uri: string; cid: string } | null | undefined;
  } | null;
}) {
  const [text, setText] = useState(article?.title ?? "");

  useEffect(() => {
    setText(article?.title ?? "");
  }, [article?.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!article) return null;

  return (
    <form id="share-article-form" method="post">
      <input type="hidden" name="_intent" value="shareToBluesky" />
      <input type="hidden" name="uri" value={article.uri} />
      {article.bskyPostRef && (
        <p
          style={{
            marginBottom: "1rem",
            color: "var(--color-warning, #d97706)",
          }}
        >
          This article has already been shared to Bluesky. Sharing again will
          create a new post.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label htmlFor="share-text">Post text</label>
        <textarea
          id="share-text"
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          style={{ resize: "vertical", width: "100%", padding: "0.5rem" }}
        />
      </div>
    </form>
  );
}

const STATUS_VARIANT: Record<
  RosterEntry["status"],
  "success" | "secondary" | "danger"
> = {
  accepted: "success",
  invited: "secondary",
  // Never actually rendered — a rejected entry is reconciled out of
  // scribe.contributors by this page's own loader before it ever reaches
  // the component (ADR 0019). Handled for type completeness only.
  rejected: "danger",
};

// Plain, un-decorated per Phase 3's own explicit scope (ADR 0022) — no
// toast, no badge, no chat post. Those are Phase 4/5, layered on top of the
// same pending_submissions data this section reads.
function SubmissionsSection({
  submissions,
}: {
  submissions: SubmissionListEntry[];
}) {
  // Phase 4 (discovery UX polish) — hidden entirely when empty, matching
  // the conditional-section pattern Standalone Articles already uses.
  if (submissions.length === 0) return null;

  return (
    <div
      style={{
        borderTop: "0.1rem solid var(--border-color)",
        marginTop: "1rem",
        paddingTop: "1rem",
      }}
    >
      <h6 style={{ margin: 0 }}>New Article Submissions</h6>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {submissions.map((s) => (
          <li
            key={`${s.contributorDid}:${s.rkey}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.8rem",
              padding: "0.8rem 0",
              borderTop: "0.1rem solid var(--border-subtle)",
            }}
          >
            <span>{s.documentTitle}</span>
            <span style={{ color: "var(--text-secondary)" }}>
              from {s.contributorDisplayName ?? s.contributorHandle}
            </span>
            <span
              style={{ color: "var(--text-secondary)", marginLeft: "auto" }}
            >
              {new Date(s.submittedAt).toLocaleDateString()}
            </span>
            <Link to={`/article/review/${s.contributorDid}/${s.rkey}`}>
              <Button type="button" variant="primary" tabIndex={-1}>
                Review
              </Button>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContributorsSection({
  contributors,
  onRemove,
  removingDid,
}: {
  contributors: RosterEntry[];
  onRemove: (did: string) => void;
  removingDid: string | null;
}) {
  // Not wrapped in its own <PageSection> — this renders inside the single
  // scrolling PageSection the whole page content shares (see Contributors
  // Phase 1 grill session, Question 4: one scrolling column, not a second
  // clipped-by-default region under the fixed container's overflow:hidden).
  return (
    <div
      style={{
        borderTop: "0.1rem solid var(--border-color)",
        marginTop: "1rem",
        paddingTop: "1rem",
      }}
    >
      <h6 style={{ margin: 0 }}>Contributors</h6>

      {contributors.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>
          No contributors yet — invite someone to let them submit articles to
          this site.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {contributors.map((c) => (
            <li
              key={c.did}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.8rem",
                padding: "0.8rem 0",
                borderTop: "0.1rem solid var(--border-subtle)",
              }}
            >
              {c.avatar && (
                <img
                  src={c.avatar}
                  alt=""
                  style={{
                    width: "3.2rem",
                    height: "3.2rem",
                    borderRadius: "50%",
                  }}
                />
              )}
              <span>{c.displayName ?? c.handle}</span>
              <span style={{ color: "var(--text-secondary)" }}>
                @{c.handle}
              </span>
              <Pill variant={STATUS_VARIANT[c.status]}>{c.status}</Pill>
              <Button
                type="button"
                variant="danger"
                style={{ marginLeft: "auto" }}
                disabled={removingDid === c.did}
                onClick={() => onRemove(c.did)}
              >
                {removingDid === c.did ? "Removing…" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function SiteListView({ loaderData }: Route.ComponentProps) {
  const { site, devMode, hasUnassignedArticles, contributors, submissions } =
    loaderData;
  const { isOpen, open, close } = useModal();
  const inviteModal = useModal();

  const removeContributorFetcher = useFetcher<{
    ok?: boolean;
    removedDid?: string;
    error?: string;
  }>();
  const removingContributorDidRef = useRef<string | null>(null);
  const isRemovingContributor = removeContributorFetcher.state !== "idle";

  function handleRemoveContributor(contributorDid: string) {
    removingContributorDidRef.current = contributorDid;
    const formData = new FormData();
    formData.set("_intent", "removeContributor");
    formData.set("contributorDid", contributorDid);
    removeContributorFetcher.submit(formData, { method: "post" });
  }

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isNewRoute = pathname.endsWith("/new");

  const openedByRouteRef = useRef(false);
  useEffect(() => {
    if (isNewRoute && !openedByRouteRef.current) {
      openedByRouteRef.current = true;
      open();
    }
    if (!isNewRoute) openedByRouteRef.current = false;
  }, [isNewRoute]);

  function handleCloseModal() {
    close();
    if (isNewRoute) navigate(`/article/list/${site.rkey}`, { replace: true });
  }

  const [sharingArticle, setSharingArticle] = useState<{
    uri: string;
    title: string;
    bskyPostRef: { uri: string; cid: string } | null | undefined;
  } | null>(null);
  const shareModal = useModal();

  const { tree, setTree, isDirty, markSaved, removeGroup, setBskyPostRef } =
    useDirtyTree(site);
  const {
    sensors,
    activeArticle,
    activeGroup,
    onDragStart,
    onDragOver,
    onDragEnd,
  } = useSiteListDnD(tree, setTree);

  // Does at least one *other* group on this site already have articles? If
  // so, an empty group is a legitimate drag-and-drop target (move an
  // article here from that other group) — show the "Drop articles here"
  // hint. If not, dragging isn't a real option yet, so point the user at
  // writing or assigning an article instead (see GroupItem).
  const siteHasAnyArticles = tree.some(
    (group) => group.id !== "g:root" && group.children.length > 0,
  );

  const saveFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isSaving = saveFetcher.state !== "idle";

  const deleteFetcher = useFetcher<{
    ok?: boolean;
    deletedSlug?: string;
    error?: string;
  }>();
  const shareFetcher = useFetcher<{
    ok?: boolean;
    uri?: string;
    bskyPostRef?: { uri: string; cid: string } | null;
    error?: string;
  }>();
  const isSharing = shareFetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";
  const deletingSlugRef = useRef<string | null>(null);

  const { addToast } = useToast();
  const blocker = useBlocker(isDirty);
  const proceedAfterSaveRef = useRef(false);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if (saveFetcher.data.ok) {
      markSaved();
      addToast({ heading: "Order saved", variant: "success" });
      if (proceedAfterSaveRef.current) {
        proceedAfterSaveRef.current = false;
        blocker.proceed?.();
      }
    } else if (saveFetcher.data.error) {
      proceedAfterSaveRef.current = false;
      addToast({
        heading: "Save failed",
        content: saveFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [saveFetcher.state, saveFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bug fix: useEffect keyed on useFetcher().data doesn't reliably re-fire
  // in this app's React Router version (see
  // feedback-usefetcher-data-effect-unreliable memory) — a missed re-fire
  // here left the deleted group in the local tree, and the next Save Order
  // would write it straight back to the PDS via a full-overwrite. Deriving
  // during render (React's documented "adjusting state" pattern) instead of
  // an effect avoids depending on the effect actually re-running.
  const [processedDeleteData, setProcessedDeleteData] = useState(
    deleteFetcher.data,
  );
  if (
    deleteFetcher.state === "idle" &&
    deleteFetcher.data &&
    deleteFetcher.data !== processedDeleteData
  ) {
    setProcessedDeleteData(deleteFetcher.data);
    if (deleteFetcher.data.ok && deleteFetcher.data.deletedSlug) {
      deletingSlugRef.current = null;
      removeGroup(deleteFetcher.data.deletedSlug);
    } else if (deleteFetcher.data.error) {
      addToast({
        heading: "Delete failed",
        content: deleteFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }

  // Same "derive during render" fix as processedDeleteData above — useEffect
  // keyed on fetcher.data doesn't reliably re-fire in this app's React
  // Router version (see feedback-usefetcher-data-effect-unreliable memory).
  const [processedRemoveContributorData, setProcessedRemoveContributorData] =
    useState(removeContributorFetcher.data);
  if (
    removeContributorFetcher.state === "idle" &&
    removeContributorFetcher.data &&
    removeContributorFetcher.data !== processedRemoveContributorData
  ) {
    setProcessedRemoveContributorData(removeContributorFetcher.data);
    removingContributorDidRef.current = null;
    if (!removeContributorFetcher.data.ok) {
      addToast({
        heading: "Remove failed",
        content: removeContributorFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }

  useEffect(() => {
    if (shareFetcher.state !== "idle" || !shareFetcher.data) return;
    if (shareFetcher.data.ok) {
      const { uri, bskyPostRef } = shareFetcher.data;
      if (uri !== undefined) setBskyPostRef(uri, bskyPostRef ?? null);
      shareModal.close();
      setSharingArticle(null);
      addToast({ heading: "Shared to Bluesky", variant: "success" });
    } else if (shareFetcher.data.error) {
      addToast({
        heading: "Share failed",
        content: shareFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [shareFetcher.state, shareFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rootIds = tree.map((n) => n.id);

  function handleDeleteGroup(slug: string) {
    deletingSlugRef.current = slug;
    const formData = new FormData();
    formData.set("_intent", "deleteGroup");
    formData.set("rkey", slug);
    deleteFetcher.submit(formData, { method: "post" });
  }

  function handleShareClick(
    uri: string,
    bskyPostRef: { uri: string; cid: string } | null | undefined,
  ) {
    const article = tree.flatMap((g) => g.children).find((c) => c.uri === uri);
    if (!article) return;
    setSharingArticle({ uri, title: article.title, bskyPostRef });
    shareModal.open();
  }

  function handleSave() {
    const siteData = treeToSiteData(tree);
    const formData = new FormData();
    formData.set("_intent", "saveSite");
    formData.set("siteData", JSON.stringify(siteData));
    saveFetcher.submit(formData, { method: "post" });
  }

  const urlAndPrefix = `${site?.url && site.url}${site?.urlPrefix && "/" + site.urlPrefix}`;

  return (
    <PageContainer
      fixed
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Groups & Articles
        </PageContainerHeading>
      }
      topButtons={
        <>
          <ButtonGroupContainer>
            <Link to={`/article/create?site=${site.rkey}`}>
              <Button type="button" variant="primary" tabIndex={-1}>
                Draft New Article
              </Button>
            </Link>
            <Link to={`/article/list/${site.rkey}/new`}>
              <Button type="button" variant="primary" tabIndex={-1}>
                Add New Group
              </Button>
            </Link>
          </ButtonGroupContainer>
          <Button type="button" variant="primary" onClick={inviteModal.open}>
            Invite Contributor
          </Button>
        </>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {/* Single scrolling column for Phase 1 (grill session Question 4) —
            title, groups, and the Contributors section all share one
            overflow region rather than a PageSectionColumns split. That
            split is deferred to Phase 5, when the chat panel actually
            exists and there's a real second thing to put beside this. */}
        <PageSection overflow>
          <h6>{site.title}</h6>
          <SortableContext
            items={rootIds}
            strategy={verticalListSortingStrategy}
          >
            <GroupList>
              {/* g:root never has anything to render — since ADR 0013 every
                  document reaching this site is already published into a
                  named group; nothing populates ungroupedArticles anymore. */}
              {tree
                .filter((group) => group.id !== "g:root")
                .map((group) => (
                  <GroupItem
                    key={group.id}
                    id={group.id}
                    title={group.title}
                    slug={group.slug}
                    articleChildren={
                      group.children.map((c) => ({
                        id: c.id,
                        uri: c.uri,
                        slug: c.slug,
                        title: c.title,
                        createdAt: c.createdAt,
                        bskyPostRef: c.bskyPostRef,
                      })) as TreeArticle[]
                    }
                    articleMode="site-published"
                    urlAndPrefix={urlAndPrefix}
                    siteName={site.title}
                    onDeleteConfirm={handleDeleteGroup}
                    onShareClick={handleShareClick}
                    isDeleting={
                      isDeleting && deletingSlugRef.current === group.slug
                    }
                    siteHasAnyArticles={siteHasAnyArticles}
                    hasUnassignedArticles={hasUnassignedArticles}
                  />
                ))}
            </GroupList>
          </SortableContext>

          <SubmissionsSection submissions={submissions} />

          <ContributorsSection
            contributors={contributors}
            onRemove={handleRemoveContributor}
            removingDid={
              isRemovingContributor ? removingContributorDidRef.current : null
            }
          />
        </PageSection>

        <DragOverlay>
          {activeArticle && (
            <ArticleItemPreview
              uri={activeArticle.uri}
              title={activeArticle.title}
              createdAt={activeArticle.createdAt}
            />
          )}
          {activeGroup && activeGroup.id !== "g:root" && (
            <GroupItemPreview
              title={activeGroup.title}
              slug={activeGroup.slug}
            />
          )}
        </DragOverlay>
      </DndContext>

      {devMode && (
        <PageSection>
          <p style={{ color: "orange" }}>Dev mode: no real PDS connected.</p>
        </PageSection>
      )}

      <FooterPortal>
        <Button
          type="button"
          variant="success"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? "Saving…" : "Save Order"}
        </Button>
      </FooterPortal>

      <Modal
        isOpen={shareModal.isOpen}
        onClose={() => {
          shareModal.close();
          setSharingArticle(null);
        }}
        title={
          sharingArticle?.bskyPostRef
            ? "Re-share to Bluesky"
            : "Share to Bluesky"
        }
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => {
                shareModal.close();
                setSharingArticle(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isSharing}
              onClick={() => {
                const form = document.getElementById(
                  "share-article-form",
                ) as HTMLFormElement | null;
                if (!form) return;
                shareFetcher.submit(new FormData(form), { method: "post" });
              }}
            >
              {isSharing
                ? "Sharing…"
                : sharingArticle?.bskyPostRef
                  ? "Re-share"
                  : "Share"}
            </Button>
          </div>
        }
      >
        <ShareModal article={sharingArticle} />
      </Modal>

      <Modal
        isOpen={isOpen}
        onClose={handleCloseModal}
        title="Add new group"
        footer={null}
      >
        <CreateGroupModal
          onClose={handleCloseModal}
          siteUrl={site.url}
          urlPrefix={site.urlPrefix}
        />
      </Modal>

      <InviteContributorModal
        isOpen={inviteModal.isOpen}
        onClose={inviteModal.close}
        existingDids={contributors.map((c) => c.did)}
      />

      <Modal
        isOpen={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Unsaved changes"
        footer={
          <div
            style={{
              display: "flex",
              gap: "0.8rem",
              justifyContent: "flex-end",
            }}
          >
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard & Leave
            </Button>
            <Button
              variant="success"
              disabled={isSaving}
              onClick={() => {
                proceedAfterSaveRef.current = true;
                handleSave();
              }}
            >
              {isSaving ? "Saving…" : "Save & Leave"}
            </Button>
          </div>
        }
      >
        <p>
          You have unsaved changes to the article order. What would you like to
          do?
        </p>
      </Modal>
    </PageContainer>
  );
}
