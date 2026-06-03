import React from "react";
import { Link } from "react-router";
import { Button } from "~/components/Button/Button";
import Tooltip, { TooltipBubble } from "~/components/Tooltip/Tooltip";
import SvgIcon, { SvgImageList } from "~/components/SvgIcon/SvgIcon";
import { type SiteData } from "~/components/types";
import { composedUrl } from "~/components/utils";
import styles from "./SiteListItem.module.css";

export type { SiteData };

type SiteListItemProps = {
  site: SiteData;
  onDelete?: (site: SiteData) => void;
  isDeleting?: boolean;
};

const SiteListItem: React.FC<SiteListItemProps> = ({
  site,
  onDelete,
  isDeleting = false,
}) => {
  return (
    <li className={styles.siteItem}>
      <div className={styles.siteDetails}>
        <div
          className={styles.splashContainer}
          style={
            site.splashImageUrl
              ? { backgroundImage: `url(${site.splashImageUrl})` }
              : undefined
          }
        >
          <div
            className={styles.logoContainer}
            style={
              site.logoImageUrl
                ? { backgroundImage: `url(${site.logoImageUrl})` }
                : undefined
            }
          />
        </div>
        <Tooltip
          anchorName={site.rkey}
          anchorPosition="top"
          anchorContent={
            <TooltipBubble pointerLocation="bottom">
              {site.description}
            </TooltipBubble>
          }
        >
          <div className={styles.siteInfo}>
            <strong className={styles.siteTitle}>{site.title}</strong>
            <span className={styles.siteUrl}>{composedUrl(site)}</span>
            <div className={styles.counts}>
              {site.groupCount > 0 && (
                <span className={styles.articleCount}>
                  {`${site.groupCount} GROUP${site.groupCount !== 1 ? "S" : ""}`}
                </span>
              )}
              {site.articleCount > 0 && (
                <span className={styles.groupCount}>
                  {site.articleCount} ARTICLE
                  {site.articleCount !== 1 ? "S" : ""}
                </span>
              )}
            </div>
          </div>
        </Tooltip>
      </div>
      <div className={styles.siteActions}>
        <Link to={`/article/list/${site.rkey}`}>
          <Button type="button">Manage Articles</Button>
        </Link>
        <Link
          to={`/site/${site.rkey}/configure`}
          className={styles.configureSiteLink}
        >
          <Button type="button" variant="secondary">
            <SvgIcon name={SvgImageList.Gear} fill="var(--blue)" />
          </Button>
        </Link>
        {onDelete && (
          <Button
            className={styles.actionButton}
            variant="danger"
            onClick={() => onDelete(site)}
            disabled={isDeleting}
          >
            <SvgIcon name={SvgImageList.Trash} fill="white" />
          </Button>
        )}
      </div>
    </li>
  );
};

export default SiteListItem;
