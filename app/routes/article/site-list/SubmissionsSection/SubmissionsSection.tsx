import { Link } from "react-router";
import cn from "classnames";
import { Button } from "~/components/Button/Button";
import { type SubmissionListEntry } from "../siteTree";
import styles from "./SubmissionsSection.module.css";

type Props = {
  submissions: SubmissionListEntry[];
};

// Plain, un-decorated per Phase 3's own explicit scope (ADR 0022) — no
// toast, no badge, no chat post. Those are Phase 4/5, layered on top of the
// same pending_submissions data this section reads.
export function SubmissionsSection({ submissions }: Props) {
  // Phase 4 (discovery UX polish) — hidden entirely when empty, matching
  // the conditional-section pattern Standalone Articles already uses.
  if (submissions.length === 0) return null;

  return (
    <div className={styles.sectionDivider}>
      <h6 className={styles.sectionHeading}>New Article Submissions</h6>

      <ul className={styles.plainList}>
        {submissions.map((s) => (
          <li key={`${s.contributorDid}:${s.rkey}`} className={styles.listRow}>
            <span>{s.documentTitle}</span>
            <span className={styles.mutedText}>
              from {s.contributorDisplayName ?? s.contributorHandle}
            </span>
            <span className={cn(styles.mutedText, styles.pushRight)}>
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
