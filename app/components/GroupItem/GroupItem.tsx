import React, { useRef } from "react";
import styles from "./GroupItem.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import ArticleItem from "../ArticleItem/ArticleItem";
import { Button } from "../Button/Button";
import { Modal } from "../Modal/Modal";
import { useModal } from "../Modal/useModal";
import { Form } from "react-router";

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
  isRoot?: boolean;
}

const GroupItem: React.FC<GroupItemProps> = ({
  id,
  uri,
  cid,
  title,
  slug,
  articleChildren,
  isRoot = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const { over } = useDndContext();
  const isOver = over?.id === id;

  const deleteModal = useModal();
  const deleteFormRef = useRef<HTMLFormElement>(null);

  const style: React.CSSProperties = {
    transform: isRoot ? undefined : CSS.Transform.toString(transform),
    transition: isRoot ? undefined : transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const childIds = articleChildren.map((a) => a.id);

  const handleDeleteClick = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    deleteModal.open();
  };

  const handleConfirmDelete = () => {
    deleteModal.close();
    deleteFormRef.current?.submit();
  };

  if (isRoot) {
    return (
      <li ref={setSortableRef} className={styles.groupItem_root}>
        <div className={styles.titleContainer_root}>
          <strong className={styles.title}>Orphaned Articles</strong>
        </div>
        <div className={styles.groupArticlesContainer}>
          <SortableContext
            items={childIds}
            strategy={verticalListSortingStrategy}
          >
            <ul
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
                <li
                  className={`${styles.dropZone} ${isOver ? styles.dropZoneOver : ""}`}
                >
                  Drop articles here
                </li>
              )}
            </ul>
          </SortableContext>
        </div>
      </li>
    );
  }

  return (
    <>
      <li ref={setSortableRef} style={style} className={styles.groupItem}>
        <div className={styles.handleContainer} {...attributes} {...listeners}>
          <SvgIcon name={SvgImageList.DragHandle} />
        </div>
        <div className={styles.titleContainer}>
          <strong className={styles.title}>{title}</strong>
          <span className={styles.slug}>{slug}</span>
        </div>
        <div className={styles.uriContainer}>
          <span className={styles.uri}>{uri}</span>
        </div>
        <div className={styles.buttonsContainer}>
          <Form ref={deleteFormRef} method="post" onSubmit={handleDeleteClick}>
            <input type="hidden" name="_intent" value="deleteGroup" />
            <input type="hidden" name="rkey" value={slug} />
            <input type="hidden" name="cid" value={cid} />
            <Button
              type="submit"
              variant="danger"
              disabled={articleChildren.length !== 0}
              title={
                articleChildren.length !== 0
                  ? "Remove all articles from this group before deleting"
                  : undefined
              }
            >
              Delete Group
            </Button>
          </Form>
        </div>
        <div className={styles.groupArticlesContainer}>
          <SortableContext
            items={childIds}
            strategy={verticalListSortingStrategy}
          >
            <ul
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
                <li
                  className={`${styles.dropZone} ${isOver ? styles.dropZoneOver : ""}`}
                >
                  Drop articles here
                </li>
              )}
            </ul>
          </SortableContext>
        </div>
      </li>
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        title="Delete Group"
        footer={
          <div
            style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}
          >
            <Button onClick={deleteModal.close} variant="secondary">
              Cancel
            </Button>
            <Button onClick={handleConfirmDelete} variant="danger">
              Delete
            </Button>
          </div>
        }
      >
        <p>Are you sure you want to delete the group "{title}"?</p>
      </Modal>
    </>
  );
};

export default GroupItem;

export function GroupItemPreview({
  title,
  slug,
  uri,
}: {
  title: string;
  slug: string;
  uri: string;
}) {
  return (
    <li className={styles.groupItem}>
      <div className={styles.handleContainer}>
        <SvgIcon name={SvgImageList.DragHandle} />
      </div>
      <div className={styles.titleContainer}>
        <strong className={styles.title}>{title}</strong>
        <span className={styles.slug}>{slug}</span>
      </div>
      <div className={styles.uriContainer}>
        <span className={styles.uri}>{uri}</span>
      </div>
      <div className={styles.buttonsContainer} />
      <div className={styles.groupArticlesContainer}>
        <ul className={styles.groupArticlesList} />
      </div>
    </li>
  );
}
