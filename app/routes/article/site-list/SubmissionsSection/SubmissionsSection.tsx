import { Link } from "react-router";
import { Button } from "~/components/Button/Button";
import { type SubmissionListEntry } from "../siteTree";
import styles from "./SubmissionsSection.module.css";
import { IconBadge } from "~/components/IconBadge/IconBadge";
import { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { Pill } from "~/components/Pill/Pill";

type Props = {
  submissions: SubmissionListEntry[];
};

// Plain, un-decorated per Phase 3's own explicit scope (ADR 0022) — no
// toast, no badge, no chat post. Those are Phase 4/5, layered on top of the
// same pending_submissions data this section reads.
export function SubmissionsSection({ submissions }: Props) {
  // Submissions are hidden entirely when empty, matching the
  // conditional-section pattern Standalone Articles already uses.
  if (submissions.length === 0) return null;

  return (
    <div className={styles.sectionDivider}>
      <h6 className={styles.sectionHeading}>New Article Submissions</h6>

      <ul className={styles.plainList}>
        {submissions.map((s) => (
          <li key={`${s.contributorDid}:${s.rkey}`} className={styles.listRow}>
            <div className={styles.detailsContainer}>
              <span className={styles.documentTitle}>
                <IconBadge icon={SvgImageList.Exclamation} size="small" />
                <strong>{s.documentTitle}</strong>
              </span>
              <span className={styles.documentContributor}>
                by{" "}
                {s.contributorAvatar && (
                  <img
                    src={s.contributorAvatar}
                    alt=""
                    className={styles.avatar}
                  />
                )}
                {s.contributorDisplayName ?? s.contributorHandle}
              </span>
              <Pill className={styles.pushRight}>
                {new Date(s.submittedAt).toLocaleDateString()}
              </Pill>
            </div>
            <div className={styles.buttonsContainer}>
              <Link to={`/article/review/${s.contributorDid}/${s.rkey}`}>
                <Button type="button" variant="primary" tabIndex={-1}>
                  Review
                </Button>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
