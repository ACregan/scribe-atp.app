import React, { useRef } from "react";
import styles from "./ArticleItem.module.css";
import { Form, Link } from "react-router";
import { Button } from "../Button/Button";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import { Modal } from "../Modal/Modal";
import { useModal } from "../Modal/useModal";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconBadge } from "../IconBadge/IconBadge";
import OverflowMenu from "../OverflowMenu/OverflowMenu";

interface ArticleItemProps {
  id: string;
  uri: string;
  slug?: string;
  title: string;
  createdAt: string;
  cid?: string;
  mode?: "pds" | "site" | "site-unpublished" | "site-published";
  groupTitle?: string;
  groupSlug?: string;
  siteName?: string;
  urlAndPrefix?: string;
  onPublishClick?: (uri: string) => void;
  onShareClick?: (
    uri: string,
    bskyPostRef: { uri: string; cid: string } | null | undefined,
  ) => void;
  bskyPostRef?: { uri: string; cid: string } | null;
  /** Site-management actions (drag, publish, share, unpublish, delete/remove)
   * hidden — for a Contributor's read-only view of someone else's site
   * (site-list.tsx). Does not affect View/Edit, which are about the
   * article's own authorship, a separate concern. */
  readOnly?: boolean;
  /** The currently logged-in viewer's own DID — compared against the
   * article's own repo DID (the first path segment of `uri`) to decide
   * whether Edit should show at all. Found live 2026-07-19: on a
   * Contributor's read-only view of someone else's site, Edit was showing
   * for every article regardless of who actually wrote it — clicking it for
   * an article you don't own 404s server-side (edit.tsx only ever scans the
   * caller's own repo), but the button itself shouldn't be offered. Omit
   * this prop to skip the check entirely (e.g. `/article/list`, where every
   * article shown is already the caller's own). */
  currentUserDid?: string;
}

const ArticleItem: React.FC<ArticleItemProps> = ({
  id,
  uri,
  slug,
  title,
  createdAt,
  cid,
  mode = "pds",
  groupTitle,
  groupSlug,
  siteName,
  urlAndPrefix,
  onPublishClick,
  onShareClick,
  bskyPostRef,
  readOnly = false,
  currentUserDid,
}) => {
  const urlKey = slug ?? uri.split("/").pop();
  // uri is always at://{did}/{collection}/{rkey} — index 2 is the DID.
  const articleOwnerDid = uri.split("/")[2];
  const isOwnArticle = !currentUserDid || articleOwnerDid === currentUserDid;
  const deleteModal = useModal();
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const unpublishModal = useModal();
  const unpublishFormRef = useRef<HTMLFormElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: readOnly });

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

  const handleUnpublishClick = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    unpublishModal.open();
  };

  const handleConfirmUnpublish = () => {
    unpublishModal.close();
    unpublishFormRef.current?.submit();
  };

  const liveUrl =
    urlAndPrefix && groupSlug
      ? `https://${urlAndPrefix}/${groupSlug}/${urlKey}`
      : undefined;

  const isPdsMode = mode === "pds";
  const isUnpublishedMode = mode === "site" || mode === "site-unpublished";
  const isPublishedMode = mode === "site-published";

  const deleteModalTitle = isPdsMode ? "Delete Article" : "Remove from Site";
  const deleteModalBody = isPdsMode
    ? `Are you sure you want to delete "${title}"?`
    : `Remove "${title}" from this site?`;

  return (
    <>
      <li ref={setNodeRef} style={style} className={styles.articleItem}>
        {!readOnly && (
          <div
            className={styles.dragHandleContainer}
            {...attributes}
            {...listeners}
          >
            <SvgIcon name={SvgImageList.DragHandle} />
          </div>
        )}
        <div className={styles.titleContainer}>
          <IconBadge icon={SvgImageList.Document} size="small" />
          <strong>{title}</strong>
          {createdAt && <span>{new Date(createdAt).toLocaleDateString()}</span>}
        </div>
        <div className={styles.buttonContainer}>
          <Link
            to={`/article/view/${urlKey}?ownerDid=${encodeURIComponent(articleOwnerDid)}`}
          >
            <Button type="button" variant="secondary" tabIndex={-1}>
              View
            </Button>
          </Link>
          {isOwnArticle && (
            <Link to={`/article/edit/${urlKey}`}>
              <Button type="button" variant="primary" tabIndex={-1}>
                Edit
              </Button>
            </Link>
          )}

          {isUnpublishedMode && !readOnly && (
            <Button
              type="button"
              variant="success"
              onClick={() => onPublishClick?.(uri)}
            >
              Publish
            </Button>
          )}

          {isPdsMode && !readOnly && (
            <Form
              ref={deleteFormRef}
              method="post"
              style={{ display: "inline" }}
              onSubmit={handleDeleteClick}
            >
              <input type="hidden" name="_intent" value="deleteArticle" />
              <input type="hidden" name="rkey" value={uri.split("/").pop()} />
              {cid && <input type="hidden" name="cid" value={cid} />}
              <Button type="submit" variant="danger">
                Delete
              </Button>
            </Form>
          )}

          {isUnpublishedMode && !readOnly && (
            <>
              <Form
                ref={deleteFormRef}
                method="post"
                style={{ display: "none" }}
              >
                <input type="hidden" name="_intent" value="removeArticle" />
                <input type="hidden" name="uri" value={uri} />
              </Form>
              <OverflowMenu>
                <Button
                  type="button"
                  variant="danger"
                  onClick={deleteModal.open}
                >
                  Remove from Site
                </Button>
              </OverflowMenu>
            </>
          )}

          {isPublishedMode && !readOnly && (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onShareClick?.(uri, bskyPostRef)}
              >
                <SvgIcon
                  className={styles.blueSkyIcon}
                  name={SvgImageList.SocialBlueSky}
                />
                {bskyPostRef ? "Re-share" : "Share"}
              </Button>
              <Form
                ref={unpublishFormRef}
                method="post"
                style={{ display: "inline" }}
                onSubmit={handleUnpublishClick}
              >
                <input type="hidden" name="_intent" value="moveToDraft" />
                <input type="hidden" name="uri" value={uri} />
                <Button type="submit" variant="danger">
                  Unpublish
                </Button>
              </Form>
              {liveUrl && (
                <OverflowMenu>
                  <Link to={liveUrl} target="_blank" rel="noreferrer">
                    <Button type="button" variant="success" tabIndex={-1}>
                      Visit On Site
                    </Button>
                  </Link>
                </OverflowMenu>
              )}
            </>
          )}
          {isPublishedMode && readOnly && liveUrl && (
            <Link to={liveUrl} target="_blank" rel="noreferrer">
              <Button type="button" variant="success" tabIndex={-1}>
                Visit On Site
              </Button>
            </Link>
          )}
        </div>
      </li>

      {(isPdsMode || isUnpublishedMode) && (
        <Modal
          isOpen={deleteModal.isOpen}
          onClose={deleteModal.close}
          title={deleteModalTitle}
          footer={
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <Button onClick={deleteModal.close} variant="secondary">
                Cancel
              </Button>
              <Button onClick={handleConfirmDelete} variant="danger">
                {isPdsMode ? "Delete" : "Remove from Site"}
              </Button>
            </div>
          }
        >
          <p>{deleteModalBody}</p>
        </Modal>
      )}

      {isPublishedMode && (
        <Modal
          isOpen={unpublishModal.isOpen}
          onClose={unpublishModal.close}
          title="Unpublish Article"
          footer={
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <Button onClick={unpublishModal.close} variant="secondary">
                Cancel
              </Button>
              <Button onClick={handleConfirmUnpublish} variant="success">
                Confirm
              </Button>
            </div>
          }
        >
          <p>
            This article will no longer be published on{" "}
            <strong>{siteName}</strong> under the <strong>{groupTitle}</strong>{" "}
            group, and will return to an unpublished, unassigned state. Are
            you sure you want to proceed?
          </p>
        </Modal>
      )}
    </>
  );
};
export default ArticleItem;

export function ArticleItemPreview({
  title,
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
        <IconBadge icon={SvgImageList.Document} size="small" />
        <strong>{title}</strong>
        {createdAt && <span>{new Date(createdAt).toLocaleDateString()}</span>}
      </div>
      <div className={styles.buttonContainer} />
    </li>
  );
}
