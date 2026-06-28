import React from "react";
import styles from "./ArticleSiteDetailsModalItem.module.css";
import type { ArticleAssignment } from "../types";
import Collapsible from "../Collapsible/Collapsible";
import Table, { type ColumnDef } from "../Table/Table";
import AtUri from "../AtUri/AtUri";
import { composedArticleUrl, composedArticleDisplayPath } from "../utils";
import { Link } from "react-router";
import { Button } from "../Button/Button";

interface ArticleSiteDetailsModalItemProps {
  site: ArticleAssignment;
  articleSlug: string;
}

const ArticleSiteDetailsModalItem: React.FC<
  ArticleSiteDetailsModalItemProps
> = ({ site, articleSlug }) => {
  const columns: ColumnDef<ArticleAssignment>[] = [
    {
      header: "Article URL",
      accessor: (row) => {
        const url = composedArticleUrl(
          row.siteUrl,
          row.siteUrlPrefix,
          row.groupSlug,
          articleSlug,
        );
        const display = composedArticleDisplayPath(
          row.siteUrlPrefix,
          row.groupSlug,
          articleSlug,
        );
        return (
          <Link
            className={styles.link}
            to={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {display}
          </Link>
        );
      },
    },
    {
      header: "Group",
      accessor: (row) => {
        if (!row.groupTitle || !row.groupSlug) return "—";
        const url = composedArticleUrl(
          row.siteUrl,
          row.siteUrlPrefix,
          row.groupSlug,
          "",
        );
        return (
          <Link
            className={styles.link}
            to={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {row.groupTitle}
          </Link>
        );
      },
    },
    { header: "AT URI", accessor: (row) => <AtUri uri={row.siteAtUri} /> },
  ];
  return (
    <div className={styles.siteContainer}>
      <Collapsible
        summary={
          <div className={styles.siteSummary}>
            <img className={styles.siteSplash} src={site.splashImageUrl} />
            <img className={styles.siteLogo} src={site.logoImageUrl} />
            <div className={styles.siteNameContainer}>
              <strong>{site.siteTitle}</strong>
            </div>
          </div>
        }
      >
        <Table data={[site]} columns={columns} layout="rows" />

        <div className={styles.buttonsContainer}>
          <Link to={`/article/list/${site.siteRkey}`}>
            <Button>Manage Groups & Articles</Button>
          </Link>
        </div>
      </Collapsible>
    </div>
  );
};

export default ArticleSiteDetailsModalItem;
