import { Button } from "~/components/Button/Button";
import { Modal } from "~/components/Modal/Modal";
import styles from "./UnsavedChangesModal.module.css";

type Props = {
  isOpen: boolean;
  isSaving: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSaveAndLeave: () => void;
};

// Navigation blocker modal (useBlocker(isDirty)) — offered when the user
// tries to leave the page with unsaved group/article order changes.
export function UnsavedChangesModal({
  isOpen,
  isSaving,
  onStay,
  onDiscard,
  onSaveAndLeave,
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onStay}
      title="Unsaved changes"
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onStay}>
            Stay
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Discard & Leave
          </Button>
          <Button variant="success" disabled={isSaving} onClick={onSaveAndLeave}>
            {isSaving ? "Saving…" : "Save & Leave"}
          </Button>
        </div>
      }
    >
      <p>You have unsaved changes to the article order. What would you like to do?</p>
    </Modal>
  );
}
