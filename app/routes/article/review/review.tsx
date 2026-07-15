import type { Route } from "./+types/review";
import { useEffect, useState } from "react";
import { useFetcher, useNavigate, Link } from "react-router";
import DOMPurify from "isomorphic-dompurify";
import {
  requireAtpAgent,
  useRealOAuth,
} from "~/services/auth.server";
import { devReviewLoader } from "~/services/devFixtures.server";
import { fetchBskyProfile } from "~/services/blueskyProfile.server";
import { pendingSubmissions } from "~/services/db.server";
import { parseSiteUri } from "~/services/pdsResolution.server";
import {
  getSubmissionForReview,
  approveSubmission,
  rejectSubmission,
} from "~/services/submissionReview.server";
import {
  createGroup as createGroupManifest,
  validateGroupFields,
} from "~/services/siteManifest.server";
import { DOCUMENT_COLLECTION, SITE_COLLECTION } from "~/constants";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import { useModal } from "~/components/Modal/useModal";
import { Select } from "~/components/Select/Select";
import { Input } from "~/components/Input/Input";
import { Textarea } from "~/components/Textarea/Textarea";
import { Pill } from "~/components/Pill/Pill";
import { PageContainer, PageSection } from "~/components/PageContainer/PageContainer";
import FooterPortal from "~/components/FooterPortal/FooterPortal";
import { Spinner } from "~/components/Spinner/Spinner";
import { useToast } from "~/components/Toast/ToastContext";
import styles from "./review.module.css";
import "@scribe-atp/styles";

const NEW_GROUP_VALUE = "__new__";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: loaderData?.document?.title
        ? `Review: ${loaderData.document.title} – Scribe ATP`
        : "Review Submission – Scribe ATP",
    },
  ];
}

export function HydrateFallback() {
  return <Spinner size="large" />;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { contributorDid, rkey } = params;

  if (!useRealOAuth) return devReviewLoader(contributorDid, rkey);

  const { agent, did } = await requireAtpAgent(request);

  const submission = await getSubmissionForReview(contributorDid, rkey);
  // ADR 0022 point 1 — the DB row is authoritative for who owns this
  // submission; a mismatch (or no row at all) is treated identically to
  // not-found, so this URL can't be used to peek at someone else's queue.
  if (!submission || submission.ownerDid !== did) {
    throw new Response("Submission not found", { status: 404 });
  }

  const { rkey: siteSlug } = parseSiteUri(submission.siteUri);
  const siteRecord = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: SITE_COLLECTION,
    rkey: siteSlug,
  });
  const scribe = (siteRecord.data.value as Record<string, unknown>).scribe as
    | Record<string, unknown>
    | undefined;
  const groups =
    (scribe?.groups as Array<{ slug: string; title: string }>) ?? [];

  const contributorProfile = await fetchBskyProfile(contributorDid);

  return {
    ...submission,
    siteSlug,
    siteTitle: String(scribe?.title ?? ""),
    groups: groups.map((g) => ({ slug: g.slug, title: g.title })),
    contributorHandle: contributorProfile?.handle ?? contributorDid,
    contributorDisplayName:
      contributorProfile?.displayName || contributorProfile?.handle || contributorDid,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { contributorDid, rkey } = params;
  const documentUri = `at://${contributorDid}/${DOCUMENT_COLLECTION}/${rkey}`;
  const formData = await request.formData();
  const intent = (formData.get("_intent") as string) ?? "";

  if (!useRealOAuth) return { ok: true };

  const { agent, did } = await requireAtpAgent(request);

  const submission = pendingSubmissions.get(documentUri);
  if (!submission || submission.ownerDid !== did) {
    return { ok: false, error: "Submission not found." };
  }

  if (intent === "approveSubmission") {
    const groupSlugRaw = formData.get("groupSlug") as string;
    const newGroupTitle = ((formData.get("newGroupTitle") as string) ?? "").trim();
    const { rkey: siteSlug } = parseSiteUri(submission.siteUri);

    let groupSlug = groupSlugRaw;
    if (groupSlugRaw === NEW_GROUP_VALUE) {
      if (!newGroupTitle) {
        return { ok: false, error: "New group title is required." };
      }
      const validated = validateGroupFields(newGroupTitle);
      if ("error" in validated) return { ok: false, error: validated.error };
      const created = await createGroupManifest(agent, did, siteSlug, {
        title: newGroupTitle,
        slug: validated.slug,
      });
      if ("error" in created) return { ok: false, error: created.error };
      groupSlug = validated.slug;
    }
    if (!groupSlug) return { ok: false, error: "A group is required." };

    const result = await approveSubmission(agent, did, documentUri, groupSlug);
    return { ...result, siteSlug };
  }

  if (intent === "rejectSubmission") {
    const reason = (formData.get("reason") as string) ?? "";
    const { rkey: siteSlug } = parseSiteUri(submission.siteUri);
    const result = rejectSubmission(documentUri, reason);
    return { ...result, siteSlug };
  }

  return { ok: false, error: "Unknown action." };
}

export default function ReviewSubmission({ loaderData }: Route.ComponentProps) {
  const {
    document,
    contributorHandle,
    contributorDisplayName,
    siteSlug,
    siteTitle,
    groups,
    submittedAt,
  } = loaderData;

  const navigate = useNavigate();
  const { addToast } = useToast();

  const approveModal = useModal();
  const [groupSlug, setGroupSlug] = useState(groups[0]?.slug ?? NEW_GROUP_VALUE);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const approveFetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    siteSlug?: string;
  }>();
  const isApproving = approveFetcher.state !== "idle";

  const rejectModal = useModal();
  const [reason, setReason] = useState("");
  const rejectFetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    siteSlug?: string;
  }>();
  const isRejecting = rejectFetcher.state !== "idle";

  useEffect(() => {
    if (approveFetcher.state !== "idle" || !approveFetcher.data) return;
    if (approveFetcher.data.ok) {
      addToast({ heading: "Submission approved", variant: "success" });
      navigate(`/article/list/${approveFetcher.data.siteSlug ?? siteSlug}`);
    } else if (approveFetcher.data.error) {
      addToast({
        heading: "Approve error",
        content: approveFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [approveFetcher.state, approveFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rejectFetcher.state !== "idle" || !rejectFetcher.data) return;
    if (rejectFetcher.data.ok) {
      addToast({ heading: "Submission rejected", variant: "success" });
      navigate(`/article/list/${rejectFetcher.data.siteSlug ?? siteSlug}`);
    } else if (rejectFetcher.data.error) {
      addToast({
        heading: "Reject error",
        content: rejectFetcher.data.error,
        variant: "danger",
        autoExpire: false,
      });
    }
  }, [rejectFetcher.state, rejectFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageContainer title={document.title}>
      <PageSection>
        <div className={styles.meta}>
          <span>
            Submitted by <strong>{contributorDisplayName}</strong>
            {contributorDisplayName !== contributorHandle && ` (@${contributorHandle})`}
          </span>
          <span className={styles.metaSep}>·</span>
          <span>for <strong>{siteTitle}</strong></span>
          <span className={styles.metaSep}>·</span>
          <span>{new Date(submittedAt).toLocaleDateString()}</span>
        </div>

        {document.tags.length > 0 && (
          <div className={styles.tags}>
            {document.tags.map((tag) => (
              <Pill key={tag} variant="secondary">
                {tag}
              </Pill>
            ))}
          </div>
        )}

        {document.splashImageUrl && (
          <img
            src={document.splashImageUrl}
            alt={document.title}
            className={styles.splashImage}
          />
        )}

        {document.description && (
          <p className={styles.description}>{document.description}</p>
        )}

        <div
          className={`scribe-content ${styles.content}`}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(document.content, { FORCE_BODY: true }),
          }}
        />
      </PageSection>

      <FooterPortal>
        <Link to={`/article/list/${siteSlug}`}>
          <Button variant="secondary" tabIndex={-1}>
            Back to site
          </Button>
        </Link>
        <Button variant="danger" onClick={() => rejectModal.open()}>
          Reject
        </Button>
        <Button variant="success" onClick={() => approveModal.open()}>
          Approve
        </Button>
      </FooterPortal>

      <Modal
        isOpen={approveModal.isOpen}
        onClose={approveModal.close}
        title="Approve Submission"
        footer={
          <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={approveModal.close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              disabled={
                isApproving ||
                (groupSlug === NEW_GROUP_VALUE ? !newGroupTitle.trim() : !groupSlug)
              }
              onClick={() => {
                const fd = new FormData();
                fd.set("_intent", "approveSubmission");
                fd.set("groupSlug", groupSlug);
                if (groupSlug === NEW_GROUP_VALUE) {
                  fd.set("newGroupTitle", newGroupTitle);
                }
                approveFetcher.submit(fd, { method: "post" });
              }}
            >
              {isApproving ? "Approving…" : "Approve"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <p style={{ margin: 0, fontSize: "1.3rem" }}>
            Approve <strong>{document.title}</strong> into which group?
          </p>
          <Select
            name="groupSlug"
            label="Group"
            value={groupSlug}
            onChange={setGroupSlug}
            options={[
              ...groups.map((g) => ({ value: g.slug, label: g.title })),
              { value: NEW_GROUP_VALUE, label: "+ Create new group" },
            ]}
          />
          {groupSlug === NEW_GROUP_VALUE && (
            <Input
              id="new-group-title"
              name="newGroupTitle"
              label="New group title"
              placeholder="e.g. Engineering"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
            />
          )}
          {approveFetcher.data?.error && (
            <p style={{ margin: 0, fontSize: "1.3rem", color: "var(--action-danger)" }}>
              {approveFetcher.data.error}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={rejectModal.isOpen}
        onClose={rejectModal.close}
        title="Reject Submission"
        footer={
          <div style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={rejectModal.close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isRejecting || !reason.trim()}
              onClick={() => {
                const fd = new FormData();
                fd.set("_intent", "rejectSubmission");
                fd.set("reason", reason);
                rejectFetcher.submit(fd, { method: "post" });
              }}
            >
              {isRejecting ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <p style={{ margin: 0, fontSize: "1.3rem" }}>
            Why are you rejecting <strong>{document.title}</strong>?
          </p>
          <Textarea
            id="reject-reason"
            label="Reason"
            placeholder="e.g. This doesn't fit the site's focus right now."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p style={{ margin: 0, fontSize: "1.2rem", color: "var(--text-secondary)" }}>
            {contributorDisplayName} will see this reason the next time they log in.
          </p>
          {rejectFetcher.data?.error && (
            <p style={{ margin: 0, fontSize: "1.3rem", color: "var(--action-danger)" }}>
              {rejectFetcher.data.error}
            </p>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
}
