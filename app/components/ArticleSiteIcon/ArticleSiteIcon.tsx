import React from "react";
import styles from "./ArticleSiteIcon.module.css";
import type { ArticleAssignment } from "~/components/types";
import Tooltip, { TooltipBubble } from "../Tooltip/Tooltip";

interface ArticleSiteIconProps {
  logoImageUrl?: string;
}

const ArticleSiteIcon: React.FC<ArticleSiteIconProps> = ({ logoImageUrl }) => {
  if (!logoImageUrl) return null;
  return (
    <div className={styles.siteIconContainer}>
      <img src={logoImageUrl} alt="" />
    </div>
  );
};

interface AllArticleSitesIconsProps {
  assignments: ArticleAssignment[];
  articleTitle: string;
  articleSlug: string;
  openDetailsModal: (
    data: ArticleAssignment[],
    title: string,
    slug: string,
  ) => void;
}

const AllArticleSitesIcons: React.FC<AllArticleSitesIconsProps> = ({
  assignments,
  articleTitle,
  articleSlug,
  openDetailsModal,
}) => {
  return (
    <Tooltip
      anchorName={`articleSiteAnchor_${articleSlug}`}
      anchorPosition="top"
      anchorContent={
        <TooltipBubble pointerLocation="bottom" variant="primary">
          {`${assignments.length} Site Assignment${assignments.length > 1 ? "s" : ""}`}
          <br />
          Click For Details
        </TooltipBubble>
      }
    >
      <div
        className={styles.allSitesContainer}
        onClick={() => openDetailsModal(assignments, articleTitle, articleSlug)}
      >
        {assignments.map((site) => (
          <ArticleSiteIcon
            key={site.siteRkey}
            logoImageUrl={site.logoImageUrl}
          />
        ))}
      </div>
    </Tooltip>
  );
};

export default AllArticleSitesIcons;
