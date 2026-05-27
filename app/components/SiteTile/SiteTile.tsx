import { Link } from "react-router";
import { Button } from "~/components/Button/Button";
import styles from "./SiteTile.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SiteData {
  rkey: string;
  cid: string;
  title: string;
  url: string;
  urlPrefix: string;
  description?: string;
  splashImageUrl?: string;
  logoImageUrl?: string;
}

type SiteTileProps = {
  site: SiteData;
  onDelete: (site: SiteData) => void;
  isDeleting?: boolean;
};

// ── Helper ────────────────────────────────────────────────────────────────────

function composedUrl(site: SiteData) {
  return site.urlPrefix ? `${site.url}/${site.urlPrefix}` : site.url;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SiteTile({ site, onDelete, isDeleting = false }: SiteTileProps) {
  return (
    <li className={styles.tile}>
      {/* Splash */}
      <div
        className={styles.tileSplash}
        style={
          site.splashImageUrl
            ? {
                backgroundImage: `url(${site.splashImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
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
          <Button type="button" variant="secondary">
            Manage
          </Button>
        </Link>
        <Link to={`/site/${site.rkey}/configure`}>
          <Button type="button" variant="secondary">
            Configure
          </Button>
        </Link>
        <Button
          variant="danger"
          onClick={() => onDelete(site)}
          disabled={isDeleting}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
