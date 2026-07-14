import React from "react";
import styles from "./ArticleSiteIcon.module.css";
import type { ArticleAssignment } from "~/components/types";
import Tooltip, { TooltipBubble } from "../Tooltip/Tooltip";

interface ArticleSiteIconProps {
  assignment: ArticleAssignment;
  articleTitle: string;
  articleSlug: string;
  openDetailsModal: (
    assignment: ArticleAssignment,
    title: string,
    slug: string,
  ) => void;
}

const ArticleSiteIcon: React.FC<ArticleSiteIconProps> = ({
  assignment,
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
          {assignment.siteUrl}
          <br />
          Click For Details
        </TooltipBubble>
      }
    >
      <div
        className={styles.iconWrapper}
        onClick={() => openDetailsModal(assignment, articleTitle, articleSlug)}
      >
        {assignment.logoImageUrl && (
          <div className={styles.siteIconContainer}>
            <img src={assignment.logoImageUrl} alt="" />
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default ArticleSiteIcon;
