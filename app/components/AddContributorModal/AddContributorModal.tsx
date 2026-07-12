import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Modal } from "~/components/Modal/Modal";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Select } from "~/components/Select/Select";
import type { Contributor } from "~/components/types";
import styles from "./AddContributorModal.module.css";

const CUSTOM_ROLE_VALUE = "__custom__";

const ROLE_OPTIONS = [
  "Editor",
  "Writer",
  "Translator",
  "Photographer",
  "Illustrator",
  "Proofreader",
];

type ResolvedProfile = {
  did: string;
  handle: string;
  displayName: string;
  avatar?: string;
};
type ResolveResult = ResolvedProfile | { error: string };

type AddContributorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (contributor: Contributor, avatar?: string) => void;
  existingDids: string[];
};

export function AddContributorModal({
  isOpen,
  onClose,
  onAdd,
  existingDids,
}: AddContributorModalProps) {
  const [handle, setHandle] = useState("");
  // Modal never unmounts its content — it only toggles the dialog's `open`
  // attribute — so the fetcher's `data` from a previous session survives a
  // close/reopen. Gating on whether a lookup has happened *this* session
  // (reset alongside the other fields below) keeps a stale result from a
  // prior failed/successful lookup from flashing on reopen, without relying
  // on a `useEffect([resolveFetcher.data])` sync (data is derived directly
  // from the fetcher during render instead, further down).
  const [hasLookedUp, setHasLookedUp] = useState(false);
  const [role, setRole] = useState(ROLE_OPTIONS[0]);
  const [customRole, setCustomRole] = useState("");
  const resolveFetcher = useFetcher<ResolveResult>();

  useEffect(() => {
    if (!isOpen) return;
    setHandle("");
    setHasLookedUp(false);
    setRole(ROLE_OPTIONS[0]);
    setCustomRole("");
  }, [isOpen]);

  const resolved =
    hasLookedUp && resolveFetcher.data && "did" in resolveFetcher.data
      ? resolveFetcher.data
      : null;
  const resolveError =
    hasLookedUp && resolveFetcher.data && "error" in resolveFetcher.data
      ? resolveFetcher.data.error
      : null;

  const isResolving = resolveFetcher.state !== "idle";
  const alreadyAdded = resolved ? existingDids.includes(resolved.did) : false;

  function handleLookup() {
    if (!handle.trim()) return;
    setHasLookedUp(true);
    resolveFetcher.load(
      `/article/resolve-contributor?handle=${encodeURIComponent(handle.trim())}`,
    );
  }

  const finalRole = role === CUSTOM_ROLE_VALUE ? customRole.trim() : role;
  const canAdd = resolved !== null && !alreadyAdded && finalRole !== "";

  function handleAdd() {
    if (!resolved || !canAdd) return;
    onAdd(
      {
        did: resolved.did,
        displayName: resolved.displayName,
        role: finalRole,
      },
      resolved.avatar,
    );
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Contributor"
      footer={
        <div
          style={{ display: "flex", gap: "0.8rem", justifyContent: "flex-end" }}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" disabled={!canAdd} onClick={handleAdd}>
            Add Contributor
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <div className={styles.lookupRow}>
          <Input
            id="contributor-handle"
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

        {resolveError && <p className={styles.error}>{resolveError}</p>}

        {resolved && (
          <div className={styles.resolvedProfile}>
            {resolved.avatar && (
              <img
                src={resolved.avatar}
                alt=""
                className={styles.resolvedAvatar}
              />
            )}
            <span className={styles.resolvedName}>{resolved.displayName}</span>
            <span className={styles.resolvedHandle}>@{resolved.handle}</span>
            {alreadyAdded && (
              <p className={styles.error}>
                This person is already a contributor on this article.
              </p>
            )}
          </div>
        )}

        <Select
          id="role"
          name="role"
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            ...ROLE_OPTIONS.map((r) => ({ value: r, label: r })),
            { value: CUSTOM_ROLE_VALUE, label: "+ Add custom role" },
          ]}
        />
        {role === CUSTOM_ROLE_VALUE && (
          <Input
            id="custom-role"
            label="Custom role"
            placeholder="e.g. Fact Checker"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}
