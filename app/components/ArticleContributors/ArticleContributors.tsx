import React, { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import styles from "./ArticleContributors.module.css";
import { Button } from "../Button/Button";
import { AddContributorModal } from "../AddContributorModal/AddContributorModal";
import { useModal } from "../Modal/useModal";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import type { Contributor } from "~/components/types";

interface ArticleContributorsProps {
  contributors: Contributor[];
  onAdd: (contributor: Contributor) => void;
  onRemove: (did: string) => void;
}

const ArticleContributors: React.FC<ArticleContributorsProps> = ({
  contributors,
  onAdd,
  onRemove,
}) => {
  const modal = useModal();
  // Avatars are display-only — never part of the persisted Contributor record
  // (site.standard.document's contributors array is did/role/displayName
  // only) — so they're refetched from Bluesky here rather than stored.
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  // DIDs we already have an answer for (avatar found, or confirmed absent).
  const fetchedDidsRef = useRef<Set<string>>(new Set());
  // DIDs included in the currently in-flight request, if any. useFetcher only
  // tracks one request per instance — calling .load() again while one is
  // still pending aborts it — so a second batch must wait rather than fire a
  // competing request that would silently drop the first batch's results.
  const pendingDidsRef = useRef<Set<string>>(new Set());
  const avatarFetcher = useFetcher<{
    profiles: { did: string; avatar?: string }[];
  }>();

  // Incorporate a newly-arrived avatar batch as soon as it shows up, during
  // render rather than in a useEffect keyed on avatarFetcher.data — a
  // useEffect dependency on a useFetcher()-derived object was found not to
  // reliably re-fire when that object's value changed (confirmed against a
  // live server: the fetcher's `data` genuinely updated across renders, but
  // an effect depending on it never re-ran). Comparing against a
  // React-owned "last processed" value during render, and calling setState
  // synchronously when it differs, is the pattern React's own docs
  // recommend for "adjusting state when a value changes" and isn't subject
  // to the same effect-scheduling question.
  const [processedData, setProcessedData] =
    useState<typeof avatarFetcher.data>(undefined);
  if (avatarFetcher.data && avatarFetcher.data !== processedData) {
    setProcessedData(avatarFetcher.data);
    pendingDidsRef.current.forEach((did) => fetchedDidsRef.current.add(did));
    pendingDidsRef.current.clear();
    const nextAvatars = { ...avatars };
    for (const p of avatarFetcher.data.profiles) {
      if (p.avatar) nextAvatars[p.did] = p.avatar;
    }
    setAvatars(nextAvatars);
  }

  // Re-checks for missing avatars whenever contributors changes, or a batch
  // just completed (pendingDidsRef was cleared above, freeing a slot).
  // Deliberately depends only on React-owned values (contributors, avatars)
  // — never on the fetcher directly — for the same reliability reason as
  // above; `pendingDidsRef.current.size` is read fresh each run instead.
  useEffect(() => {
    if (pendingDidsRef.current.size > 0) return;
    const missing = contributors
      .map((c) => c.did)
      .filter((did) => !fetchedDidsRef.current.has(did));
    if (missing.length === 0) return;
    missing.forEach((did) => pendingDidsRef.current.add(did));
    const params = new URLSearchParams();
    missing.forEach((did) => params.append("did", did));
    avatarFetcher.load(`/article/resolve-contributor?${params}`);
    // avatarFetcher intentionally omitted — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contributors, avatars]);

  function handleAdd(contributor: Contributor, avatar?: string) {
    if (avatar) {
      // Already resolved during the handle lookup — seed it directly instead
      // of letting the effect above re-fetch the same profile a second time.
      fetchedDidsRef.current.add(contributor.did);
      setAvatars((prev) => ({ ...prev, [contributor.did]: avatar }));
    }
    onAdd(contributor);
  }

  return (
    <div className={styles.contributorsContainer}>
      <label className={styles.label}>Contributors</label>
      {contributors.length > 0 && (
        <ul className={styles.list}>
          {contributors.map((contributor) => (
            <Contributor
              key={contributor.did}
              contributor={contributor}
              avatars={avatars}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
      <Button type="button" onClick={modal.open}>
        Add Contributor
      </Button>
      <AddContributorModal
        isOpen={modal.isOpen}
        onClose={modal.close}
        onAdd={handleAdd}
        existingDids={contributors.map((c) => c.did)}
      />
    </div>
  );
};

type ContributorRowProps = {
  contributor: Contributor;
  avatars: Record<string, string>;
  onRemove: (did: string) => void;
};

const Contributor = ({
  contributor,
  avatars,
  onRemove,
}: ContributorRowProps) => {
  return (
    <li key={contributor.did} className={styles.contributor}>
      <span className={styles.role}>{contributor.role}</span>
      {avatars[contributor.did] && (
        <img src={avatars[contributor.did]} alt="" className={styles.avatar} />
      )}
      <span className={styles.displayName}>{contributor.displayName}</span>
      <Button
        type="button"
        className={styles.removeButton}
        aria-label={`Remove ${contributor.displayName}`}
        onClick={() => onRemove(contributor.did)}
      >
        <SvgIcon name={SvgImageList.Cross} />
      </Button>
    </li>
  );
};

export default ArticleContributors;
