import type { Route } from "./+types/site-list";
import {
  redirect,
  useFetcher,
  useBlocker,
  useNavigate,
  useLocation,
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
import { Spinner } from "~/components/Spinner/Spinner";
import { useModal } from "~/components/Modal/useModal";
import {
  ButtonGroupContainer,
  PageContainer,
  PageContainerHeading,
  PageSection,
  PageSectionColumns,
  PageSectionColumn,
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
import {
  pendingSubmissions,
  contributorMemberships,
} from "~/services/db.server";
import { parseSiteUri } from "~/services/pdsResolution.server";
import { getPublicSiteRecord } from "~/services/submissionReview.server";
import {
  type SiteManifest,
  type RosterEntry,
  type SubmissionListEntry,
  treeToSiteData,
} from "./siteTree";
import { useDirtyTree } from "./useDirtyTree";
import { useSiteListDnD } from "./useSiteListDnD";
import { SiteChatPanel } from "./SiteChatPanel/SiteChatPanel";
import { ContributorsSection } from "./ContributorsSection/ContributorsSection";
import { SubmissionsSection } from "./SubmissionsSection/SubmissionsSection";
import { CreateGroupModal } from "./CreateGroupModal/CreateGroupModal";
import { InviteContributorModal } from "./InviteContributorModal/InviteContributorModal";
import { ShareModal } from "./ShareModal/ShareModal";
import { UnsavedChangesModal } from "./UnsavedChangesModal/UnsavedChangesModal";
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
import TabSection from "~/components/TabSection/TabSection";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.site?.title ?? "Site";
  return [{ title: `Scribe ATP – ${title}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const siteSlug = params.siteSlug;

  if (!useRealOAuth) {
    const viewAsContributor =
      new URL(request.url).searchParams.get("viewAs") === "contributor";
    return devSiteListLoader(siteSlug, viewAsContributor);
  }

  try {
    const { agent, did } = await requireAtpAgent(request);

    // Found live 2026-07-17: this page was Owner-only by accident, not by
    // design — the fast path below assumes the caller owns the record at
    // this rkey in their own repo, which is true for every Owner visit but
    // never true for a Contributor (their own repo has no record at this
    // rkey at all). Contributors get read-only access to the same page
    // (Groups/Articles, roster, Site Chat) via a fallback: their own
    // accepted contributor_memberships row names the site's real at:// URI
    // (owner DID included), so a public cross-repo read resolves the same
    // record the Owner sees, minus any capability to write to it.
    let ownerDid = did;
    let isOwner = true;
    let record:
      { data: { cid?: string; value: Record<string, unknown> } } | undefined;
    try {
      record = await agent.com.atproto.repo.getRecord({
        repo: did,
        collection: SITE_COLLECTION,
        rkey: siteSlug,
      });
    } catch {
      const membership = contributorMemberships
        .listForContributor(did)
        .find(
          (m) => m.status === "accepted" && m.siteUri.endsWith(`/${siteSlug}`),
        );
      if (!membership) throw new Error("Site not found or not accessible.");
      isOwner = false;
      ({ ownerDid } = parseSiteUri(membership.siteUri));
      const publicValue = await getPublicSiteRecord(ownerDid, siteSlug);
      if (!publicValue) throw new Error("Site record not found.");
      record = { data: { value: publicValue } };
    }

    // ADR 0019 — Owner-side reconciliation: promote locally-accepted invites
    // and strip locally-rejected ones out of scribe.contributors, every time
    // the Owner visits this page. Cheap no-op when there's nothing pending.
    // core.tsx's global loop (every page, every owned site) also runs this,
    // so this call is a same-page belt-and-braces, not the sole trigger.
    // Contributor visits skip this entirely — their session can't write to
    // the Owner's record anyway (ADR 0014's cross-repo write asymmetry).
    if (isOwner) {
      await reconcileContributorStatuses(agent, did, siteSlug);
    }

    const value = record.data.value;
    const scribeVal = (value.scribe as Record<string, unknown>) ?? {};

    // Owner-only concerns below — a Contributor's own loose documents and
    // this site's pending submissions aren't theirs to act on here (Review
    // is an Owner action; the review route has its own ownerDid guard
    // regardless), so there's no reason to fetch either for a read-only visit.
    const documents = isOwner ? await listDocuments(agent, ownerDid) : [];

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
    const siteUri = `at://${ownerDid}/${SITE_COLLECTION}/${siteSlug}`;
    const submissions = isOwner
      ? pendingSubmissions
          .listForOwner(ownerDid)
          .filter((s) => s.siteUri === siteUri && s.status === "pending")
      : [];

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
      // The current viewer's own DID — for Site Chat's own-vs-others
      // styling, distinct from siteOwnerDid below (which is who owns the
      // site, not who's looking at it right now).
      authorDid: did,
      siteOwnerDid: ownerDid,
      isOwner,
      hasUnassignedArticles,
      contributors,
      submissions: submissionRows,
      site: {
        rkey: siteSlug,
        cid: record.data.cid ?? "",
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
    const result = await removeContributor(
      agent,
      did,
      siteSlug,
      contributorDid,
    );
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

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export default function SiteListView({ loaderData }: Route.ComponentProps) {
  const {
    site,
    devMode,
    authorDid,
    siteOwnerDid,
    isOwner,
    hasUnassignedArticles,
    contributors,
    submissions,
  } = loaderData;

  // ADR 0026 (Site Chat group redesign) — "the chat feature has no reason
  // to exist until a contributor has been added to the site" (explicit user
  // decision): the group itself is only ever created once the Owner's own
  // reconciliation accepts a first Contributor, so there's nothing to show
  // an Owner with an empty roster. A Contributor viewing this page is
  // necessarily themselves an accepted Contributor (ADR 0025's read-only
  // access check), so the group is guaranteed to already exist for them.
  const hasAcceptedContributors = contributors.some(
    (c) => c.status === "accepted",
  );
  const showSiteChat = isOwner ? hasAcceptedContributors : true;
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

  const tabConfig = [
    {
      label: "Discussion",
      component: (
        <SiteChatPanel
          siteSlug={site.rkey}
          currentUserDid={authorDid}
          ownerDid={siteOwnerDid}
        />
      ),
    },
    {
      label: "Contributors",
      component: (
        <ContributorsSection
          contributors={contributors}
          onRemove={handleRemoveContributor}
          removingDid={
            isRemovingContributor ? removingContributorDidRef.current : null
          }
          isOwner={isOwner}
        />
      ),
    },
  ];

  return (
    <PageContainer
      fixed
      title={
        <PageContainerHeading icon={SvgImageList.Documents}>
          Groups & Articles
        </PageContainerHeading>
      }
      topButtons={
        isOwner ? (
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
        ) : undefined
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {/* Two-column layout (ADR 0025, Site Chat) — main content at 2/3
            width, Site Chat at 1/3, both scrolling independently, when
            there's a chat to show (ADR 0026 — hidden entirely for an Owner
            with no accepted Contributors yet, since the group itself
            doesn't exist until then). Single scrolling column otherwise. */}
        <PageSection fill>
          <PageSectionColumns breakpoint="lg">
            <PageSectionColumn span={showSiteChat ? 8 : 12} overflow>
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
                        readOnly={!isOwner}
                        currentUserDid={authorDid}
                      />
                    ))}
                </GroupList>
              </SortableContext>

              <SubmissionsSection submissions={submissions} />
            </PageSectionColumn>

            {showSiteChat && (
              <PageSectionColumn span={4} overflow>
                <TabSection items={tabConfig} />
              </PageSectionColumn>
            )}
          </PageSectionColumns>
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
          <p className={styles.devModeNotice}>
            Dev mode: no real PDS connected.
          </p>
        </PageSection>
      )}

      {isOwner && (
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
      )}

      <ShareModal
        isOpen={shareModal.isOpen}
        onClose={() => {
          shareModal.close();
          setSharingArticle(null);
        }}
        article={sharingArticle}
        isSharing={isSharing}
        onSubmit={(formData) => shareFetcher.submit(formData, { method: "post" })}
      />

      <CreateGroupModal
        isOpen={isOpen}
        onClose={handleCloseModal}
        siteUrl={site.url}
        urlPrefix={site.urlPrefix}
      />

      <InviteContributorModal
        isOpen={inviteModal.isOpen}
        onClose={inviteModal.close}
        existingDids={contributors.map((c) => c.did)}
      />

      <UnsavedChangesModal
        isOpen={blocker.state === "blocked"}
        isSaving={isSaving}
        onStay={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
        onSaveAndLeave={() => {
          proceedAfterSaveRef.current = true;
          handleSave();
        }}
      />
    </PageContainer>
  );
}
