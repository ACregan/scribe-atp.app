import React, { useEffect } from "react";
import styles from "./Toast.module.css";
import classNames from "classnames/bind";
import { useToast, type ToastPropsWithId } from "./ToastContext";

const cx = classNames.bind(styles);

interface ToastContainerProps {
  children: React.ReactNode;
}
const ToastContainer: React.FC<ToastContainerProps> = ({ children }) => {
  return <div className={styles.toastContainer}>{children}</div>;
};

const Toast: React.FC<ToastPropsWithId> = ({
  id,
  heading,
  content,
  removeToast,
  autoExpire = true,
  expireTimeSeconds = 5,
  variant = "primary",
}) => {
  const toastClasses = cx({
    toast: true,
    primaryVariant: variant === "primary",
    secondaryVariant: variant === "secondary",
    dangerVariant: variant === "danger",
  });

  useEffect(() => {
    if (!autoExpire) return;
    const timer = setTimeout(() => removeToast(id), expireTimeSeconds * 1000);
    return () => clearTimeout(timer);
  }, [id, autoExpire, expireTimeSeconds, removeToast]);

  return (
    <div className={toastClasses}>
      <div className={styles.toastHeaderContainer}>
        <span className={styles.toastHeader}>{heading}</span>
        <button
          type="button"
          onClick={() => removeToast(id)}
          className={styles.closeButton}
        >
          &times;
        </button>
      </div>
      <div className={styles.toastContent}>{content}</div>
    </div>
  );
};

const Toasts = () => {
  const { toasts, removeToast } = useToast();

  return (
    <ToastContainer>
      {toasts.map((toastItem) => {
        return (
          <Toast key={toastItem.id} {...toastItem} removeToast={removeToast} />
        );
      })}
    </ToastContainer>
  );
};

export { ToastContainer, Toast, Toasts };
