import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/Button/Button";
import { Input } from "~/components/Input/Input";
import { Modal } from "~/components/Modal/Modal";
import { SLUG_RE } from "~/constants";
import { toSlug } from "../siteTree";
import styles from "./CreateGroupModal.module.css";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  siteUrl: string;
  urlPrefix: string;
};

export function CreateGroupModal({ isOpen, onClose, siteUrl, urlPrefix }: Props) {
  const fetcher = useFetcher<{ error?: string }>();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const slugDirtyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isPending = fetcher.state !== "idle";
  const slugValid = slug === "" || SLUG_RE.test(slug);
  const composedPath = [siteUrl, urlPrefix, slug].filter(Boolean).join("/");

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) {
      onCloseRef.current();
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add new group" footer={null}>
      <fetcher.Form method="post" className={styles.formColumn}>
        <input type="hidden" name="_intent" value="createGroup" />
        <Input
          id="group-title"
          name="title"
          label="Group title"
          placeholder="e.g. Engineering"
          value={title}
          onChange={(e) => {
            const value = e.target.value;
            setTitle(value);
            if (!slugDirtyRef.current) setSlug(toSlug(value));
          }}
          autoFocus
        />
        <Input
          id="group-slug"
          name="slug"
          label="URL path"
          placeholder="e.g. engineering"
          value={slug}
          onChange={(e) => {
            slugDirtyRef.current = true;
            setSlug(e.target.value.toLowerCase());
          }}
          error={
            !slugValid
              ? "Lowercase letters, numbers and hyphens only."
              : undefined
          }
        />
        {slug && slugValid && (
          <p className={styles.helperText}>
            Path: <code>{composedPath}</code>
          </p>
        )}
        {fetcher.data?.error && (
          <p className={styles.formError}>{fetcher.data.error}</p>
        )}
        <p className={styles.helperText}>
          The URL path cannot be changed after the group is created.
        </p>
        <Button
          type="submit"
          disabled={isPending || !title.trim() || !slug || !slugValid}
        >
          {isPending ? "Creating…" : "Create Group"}
        </Button>
      </fetcher.Form>
    </Modal>
  );
}
