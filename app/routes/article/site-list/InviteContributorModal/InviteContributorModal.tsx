import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import styles from "./InviteContributorModal.module.css";

type ResolvedProfile = {
  did: string;
  handle: string;
  displayName: string;
  avatar?: string;
};
type ResolveResult = ResolvedProfile | { error: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  existingDids: string[];
};

// Modal for adding someone to this site's Contributor roster (ADR 0014/0018/
// 0019). Handle-resolution half mirrors AddContributorModal (the document-
// level byline feature's existing lookup flow) — reused rather than building
// a second lookup pattern — but unlike that modal, "Send Invite" is a real
// server write (scribe.contributors + contributor_memberships), not local
// component state staged for a later form save.
export function InviteContributorModal({ isOpen, onClose, existingDids }: Props) {
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

  // Mirrors CreateGroupModal's close-on-success effect — this pattern is
  // already proven to work in this file for a modal+fetcher submission.
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
        <div className={styles.modalFooter}>
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
      <div className={styles.formColumn}>
        <div className={styles.handleInputRow}>
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

        {resolveError && <p className={styles.errorText}>{resolveError}</p>}
        {inviteFetcher.data?.error && (
          <p className={styles.errorText}>{inviteFetcher.data.error}</p>
        )}

        {resolved && (
          <div className={styles.resolvedProfileRow}>
            {resolved.avatar && (
              <img src={resolved.avatar} alt="" className={styles.avatar} />
            )}
            <span>{resolved.displayName}</span>
            <span className={styles.mutedText}>@{resolved.handle}</span>
            {alreadyOnRoster && (
              <p className={styles.errorText}>
                This person is already on the roster for this site.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
