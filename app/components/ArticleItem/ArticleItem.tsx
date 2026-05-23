import React, { useRef } from "react";
import styles from "./ArticleItem.module.css";
import { Form, Link } from "react-router";
import { Button } from "../Button/Button";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import { Modal } from "../Modal/Modal";
import { useModal } from "../Modal/useModal";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ArticleItemProps {
  id: string;
  uri: string;
  title: string;
  createdAt: string;
  cid: string;
}

const ArticleItem: React.FC<ArticleItemProps> = ({
  id,
  uri,
  title,
  createdAt,
  cid,
}) => {
  const deleteModal = useModal();
  const deleteFormRef = useRef<HTMLFormElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const handleDeleteClick = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    deleteModal.open();
  };

  const handleConfirmDelete = () => {
    deleteModal.close();
    deleteFormRef.current?.submit();
  };

  return (
    <>
      <li ref={setNodeRef} style={style} className={styles.articleItem}>
        <div
          className={styles.dragHandleContainer}
          {...attributes}
          {...listeners}
        >
          <SvgIcon name={SvgImageList.DragHandle} />
        </div>
        <div className={styles.titleContainer}>
          <strong>{title}</strong>
          {createdAt && <span>{new Date(createdAt).toLocaleDateString()}</span>}
        </div>
        <div className={styles.information}>
          <small style={{ fontFamily: "monospace" }}>{uri}</small>
        </div>
        <div className={styles.buttonContainer}>
          <Link to={`/article/view/${uri.split("/").pop()}`}>
            <Button type="button" variant="primary">
              View
            </Button>
          </Link>
          <Link to={`/article/edit/${uri.split("/").pop()}`}>
            <Button type="button" variant="primary">
              Edit
            </Button>
          </Link>
          <Form
            ref={deleteFormRef}
            method="post"
            style={{ display: "inline" }}
            onSubmit={handleDeleteClick}
          >
            <input type="hidden" name="_intent" value="deleteArticle" />
            <input type="hidden" name="rkey" value={uri.split("/").pop()} />
            <input type="hidden" name="cid" value={cid} />
            <Button type="submit" variant="danger">
              Delete
            </Button>
          </Form>
        </div>
      </li>
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        title="Delete Article"
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
        <p>Are you sure you want to delete "{title}"?</p>
      </Modal>
    </>
  );
};
export default ArticleItem;

export function ArticleItemPreview({
  title,
  uri,
  createdAt,
}: {
  title: string;
  uri: string;
  createdAt: string;
}) {
  return (
    <li className={styles.articleItem}>
      <div className={styles.dragHandleContainer}>
        <SvgIcon name={SvgImageList.DragHandle} />
      </div>
      <div className={styles.titleContainer}>
        <strong>{title}</strong>
        {createdAt && <span>{new Date(createdAt).toLocaleDateString()}</span>}
      </div>
      <div className={styles.information}>
        <small style={{ fontFamily: "monospace" }}>{uri}</small>
      </div>
      <div className={styles.buttonContainer} />
    </li>
  );
}
