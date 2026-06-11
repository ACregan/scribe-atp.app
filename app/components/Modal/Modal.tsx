import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./Modal.module.css";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
};

export const Modal = forwardRef<HTMLDialogElement, ModalProps>(function Modal(
  {
    isOpen,
    onClose,
    title,
    footer,
    children,
    className,
    bodyClassName,
    style,
    bodyStyle,
  },
  ref,
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useImperativeHandle(ref, () => dialogRef.current as HTMLDialogElement);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal?.();
        // jsdom doesn't implement showModal() — fall back to setting the attribute
        if (!dialog.open) dialog.setAttribute("open", "");
      }
    } else {
      if (dialog.open) {
        dialog.close?.();
        dialog.removeAttribute("open");
      }
    }
  }, [isOpen]);

  // Escape key — skip if the browser is currently in fullscreen so that pressing
  // Escape to exit fullscreen doesn't also close the modal behind it.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      // prevent native Escape close — our keydown listener handles it
      onCancel={(e) => e.preventDefault()}
      onClick={handleBackdropClick}
      aria-labelledby={titleId}
    >
      <div
        className={`${styles.modal}${className ? ` ${className}` : ""}`}
        style={style}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div
          className={`${styles.body}${bodyClassName ? ` ${bodyClassName}` : ""}`}
          style={bodyStyle}
        >
          {children}
        </div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </dialog>
  );
});
