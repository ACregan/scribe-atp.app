import React from "react";
import styles from "./GroupItem.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";

interface GroupItemProps {
  uri: string;
  cid: string;
  title: string;
  slug: string;
}

const GroupItem: React.FC<GroupItemProps> = ({ uri, cid, title, slug }) => {
  return (
    <li key={uri} className={styles.groupItem}>
      <div className={styles.handleContainer}>
        <SvgIcon name={SvgImageList.DragHandle} />
      </div>
      <div className={styles.titleContainer}>
        <strong className={styles.title}>{title}</strong>
        <span className={styles.slug}></span>
      </div>
      <div className={styles.uriContainer}>
        <span className={styles.uri}>{uri}</span>
      </div>
      <div className={styles.buttonsContainer}></div>
      <div className={styles.groupArticlesContainer}>
        <ul className={styles.groupArticlesList}>
          {/* ARTICLES CAN BE DRAG N DROPPED HERE 
                They will be added to the group
          */}
        </ul>
      </div>
    </li>
  );
};

export default GroupItem;
