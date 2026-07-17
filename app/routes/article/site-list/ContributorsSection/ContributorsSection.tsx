import { Button } from "~/components/Button/Button";
import { Pill } from "~/components/Pill/Pill";
import { type RosterEntry } from "../siteTree";
import styles from "./ContributorsSection.module.css";

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

type Props = {
  contributors: RosterEntry[];
  onRemove: (did: string) => void;
  removingDid: string | null;
  isOwner: boolean;
};

export function ContributorsSection({
  contributors,
  onRemove,
  removingDid,
  isOwner,
}: Props) {
  // Not wrapped in its own <PageSection> — this renders inside the single
  // scrolling PageSection the whole page content shares (see Contributors
  // Phase 1 grill session, Question 4: one scrolling column, not a second
  // clipped-by-default region under the fixed container's overflow:hidden).
  return (
    <div className={styles.sectionDivider}>
      {contributors.length === 0 ? (
        <p className={styles.mutedText}>
          No contributors yet — invite someone to let them submit articles to
          this site.
        </p>
      ) : (
        <ul className={styles.plainList}>
          {contributors.map((c) => (
            <li key={c.did} className={styles.listRow}>
              {c.avatar && (
                <img src={c.avatar} alt="" className={styles.avatar} />
              )}
              <span>{c.displayName ?? c.handle}</span>
              <span className={styles.mutedText}>@{c.handle}</span>
              <Pill variant={STATUS_VARIANT[c.status]}>{c.status}</Pill>
              {isOwner && (
                <Button
                  type="button"
                  variant="danger"
                  className={styles.pushRight}
                  disabled={removingDid === c.did}
                  onClick={() => onRemove(c.did)}
                >
                  {removingDid === c.did ? "Removing…" : "Remove"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
