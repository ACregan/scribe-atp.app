import React from "react";
import styles from "./GroupItem.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import ArticleItem from "../ArticleItem/ArticleItem";

export interface TreeArticle {
  id: string;
  uri: string;
  cid: string;
  title: string;
  createdAt: string;
}

interface GroupItemProps {
  id: string;
  uri: string;
  cid: string;
  title: string;
  slug: string;
  articleChildren: TreeArticle[];
}

const GroupItem: React.FC<GroupItemProps> = ({
  id,
  uri,
  title,
  slug,
  articleChildren,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const dropZoneId = `drop:${id}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropZoneId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const childIds = articleChildren.map((a) => a.id);

  return (
    <li ref={setSortableRef} style={style} className={styles.groupItem}>
      <div
        className={styles.handleContainer}
        {...attributes}
        {...listeners}
      >
        <SvgIcon name={SvgImageList.DragHandle} />
      </div>
      <div className={styles.titleContainer}>
        <strong className={styles.title}>{title}</strong>
        <span className={styles.slug}>{slug}</span>
      </div>
      <div className={styles.uriContainer}>
        <span className={styles.uri}>{uri}</span>
      </div>
      <div className={styles.buttonsContainer}></div>
      <div className={styles.groupArticlesContainer}>
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          <ul
            ref={setDropRef}
            className={`${styles.groupArticlesList} ${isOver && articleChildren.length === 0 ? styles.dropZoneOver : ""}`}
          >
            {articleChildren.map((article) => (
              <ArticleItem
                key={article.id}
                id={article.id}
                uri={article.uri}
                cid={article.cid}
                title={article.title}
                createdAt={article.createdAt}
              />
            ))}
            {articleChildren.length === 0 && (
              <li className={`${styles.dropZone} ${isOver ? styles.dropZoneOver : ""}`}>
                Drop articles here
              </li>
            )}
          </ul>
        </SortableContext>
      </div>
    </li>
  );
};

export default GroupItem;
