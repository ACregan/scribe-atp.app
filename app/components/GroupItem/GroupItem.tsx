import React, { useRef } from "react";
import { Spinner } from "../Spinner/Spinner";
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
import Tooltip, { TooltipBubble } from "../Tooltip/Tooltip";

import { type TreeArticle } from "~/components/types";
export type { TreeArticle };

interface GroupItemProps {
  id: string;
  uri?: string;
  cid?: string;
  title: string;
  slug: string;
  articleChildren: TreeArticle[];
  isRoot?: boolean;
  articleMode?: "pds" | "site";
  urlAndPrefix?: string;
  onDeleteConfirm?: (slug: string) => void;
  isDeleting?: boolean;
}

const GroupItem: React.FC<GroupItemProps> = ({
  id,
  // uri, DEAD PROP?
  cid,
  title,
  slug,
  articleChildren,
  isRoot = false,
  articleMode = "pds",
  urlAndPrefix,
  onDeleteConfirm,
  isDeleting = false,
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
    if (onDeleteConfirm) {
      onDeleteConfirm(slug);
    } else {
      deleteFormRef.current?.submit();
    }
  };

  if (isRoot) {
    return (
      <>
        <li ref={setSortableRef} className={styles.groupItem_root}>
          <div className={styles.titleContainer_root}>
            <strong className={styles.title}>Ungrouped Articles</strong>
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
                    mode={articleMode}
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
        <hr style={{ margin: "1rem 0 0 0" }} />
        <h4 className={styles.groupHeading}>Groups</h4>
      </>
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
          <Tooltip
            anchorName={slug}
            anchorPosition="bottom"
            anchorContent={
              <TooltipBubble pointerLocation="top" variant="secondary">
                <code>
                  https://{urlAndPrefix}/
                  <strong>
                    <u>{slug}</u>
                  </strong>
                  /...
                </code>
              </TooltipBubble>
            }
          >
            <span className={styles.slug}>/{slug}</span>
          </Tooltip>
        </div>
        {/*<div className={styles.middleContainer}></div> */}

        <div className={styles.buttonsContainer}>
          <Form ref={deleteFormRef} method="post" onSubmit={handleDeleteClick}>
            <input type="hidden" name="_intent" value="deleteGroup" />
            <input type="hidden" name="rkey" value={slug} />
            {cid && <input type="hidden" name="cid" value={cid} />}

            <Tooltip
              anchorName={`${slug}_deleteButton`}
              anchorPosition="bottom"
              anchorContent={
                <TooltipBubble pointerLocation="top" variant="danger">
                  DELETE GROUP
                  {articleChildren.length !== 0 ? (
                    <>
                      <br />
                      Remove or Move all articles before deleting.
                    </>
                  ) : (
                    ""
                  )}
                </TooltipBubble>
              }
            >
              <Button
                className={styles.deleteGroupButton}
                type="submit"
                variant="danger"
                disabled={articleChildren.length !== 0 || isDeleting}
              >
                {isDeleting ? (
                  <Spinner size="small" />
                ) : (
                  <SvgIcon name={SvgImageList.Trash} fill="var(--white)" />
                )}
              </Button>
            </Tooltip>
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
                  mode={articleMode}
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
  uri?: string;
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
      {uri && (
        <div className={styles.uriContainer}>
          <span className={styles.uri}>{uri}</span>
        </div>
      )}
      <div className={styles.buttonsContainer} />
      <div className={styles.groupArticlesContainer}>
        <ul className={styles.groupArticlesList} />
      </div>
    </li>
  );
}
