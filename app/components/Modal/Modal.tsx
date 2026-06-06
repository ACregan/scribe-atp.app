import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function Modal({
  isOpen,
  onClose,
  title,
  footer,
  children,
  className,
  bodyClassName,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`${styles.modal}${className ? ` ${className}` : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div
          className={`${styles.body}${bodyClassName ? ` ${bodyClassName}` : ""}`}
        >
          {children}
        </div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
