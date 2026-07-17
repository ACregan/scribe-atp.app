import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import styles from "./ShareModal.module.css";

type Article = {
  uri: string;
  title: string;
  bskyPostRef: { uri: string; cid: string } | null | undefined;
} | null;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  article: Article;
  isSharing: boolean;
  onSubmit: (formData: FormData) => void;
};

export function ShareModal({ isOpen, onClose, article, isSharing, onSubmit }: Props) {
  const [text, setText] = useState(article?.title ?? "");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setText(article?.title ?? "");
  }, [article?.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit() {
    if (!formRef.current) return;
    onSubmit(new FormData(formRef.current));
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={article?.bskyPostRef ? "Re-share to Bluesky" : "Share to Bluesky"}
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isSharing}
            onClick={handleSubmit}
          >
            {isSharing ? "Sharing…" : article?.bskyPostRef ? "Re-share" : "Share"}
          </Button>
        </div>
      }
    >
      {article && (
        <form method="post" ref={formRef}>
          <input type="hidden" name="_intent" value="shareToBluesky" />
          <input type="hidden" name="uri" value={article.uri} />
          {article.bskyPostRef && (
            <p className={styles.shareWarning}>
              This article has already been shared to Bluesky. Sharing again
              will create a new post.
            </p>
          )}
          <div className={styles.shareTextField}>
            <label htmlFor="share-text">Post text</label>
            <textarea
              id="share-text"
              name="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className={styles.shareTextarea}
            />
          </div>
        </form>
      )}
    </Modal>
  );
}
