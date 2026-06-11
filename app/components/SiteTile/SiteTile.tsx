import { Link } from "react-router";
import { Button } from "~/components/Button/Button";
import styles from "./SiteTile.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import { type SiteCard } from "~/components/types";
import { composedUrl } from "~/components/utils";

export type { SiteCard };

type SiteTileProps = {
  site: SiteCard;
  onDelete: (site: SiteCard) => void;
  isDeleting?: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SiteTile({
  site,
  onDelete,
  isDeleting = false,
}: SiteTileProps) {
  return (
    <li className={styles.tile}>
      {/* Splash */}
      <div
        className={styles.tileSplash}
        style={
          site.splashImageUrl
            ? { backgroundImage: `url(${site.splashImageUrl})` }
            : undefined
        }
      />

      {/* Body */}
      <div className={styles.tileBody}>
        <div className={styles.tileHeader}>
          {site.logoImageUrl && (
            <img
              className={styles.tileLogo}
              src={site.logoImageUrl}
              alt={`${site.title} logo`}
            />
          )}
          <h2 className={styles.tileTitle}>{site.title}</h2>
        </div>

        {site.description && (
          <p className={styles.tileDescription}>{site.description}</p>
        )}

        <span className={styles.tileUrl}>{composedUrl(site)}</span>
      </div>

      {/* Actions */}
      <div className={styles.tileActions}>
        <Link to={`/article/list/${site.rkey}`}>
          <Button
            className={styles.actionButton}
            type="button"
            variant="primary"
          >
            Manage
          </Button>
        </Link>
        <div className={styles.rightAlignedActionButtons}>
          <Link to={`/site/${site.rkey}/configure`}>
            <Button
              className={styles.actionButton}
              type="button"
              variant="secondary"
            >
              <SvgIcon name={SvgImageList.Gear} fill="var(--action-primary)" />
            </Button>
          </Link>
          <Button
            className={styles.actionButton}
            aria-label="Delete site"
            variant="danger"
            onClick={() => onDelete(site)}
            disabled={isDeleting}
          >
            <SvgIcon name={SvgImageList.Trash} fill="white" />
          </Button>
        </div>
      </div>
    </li>
  );
}
