import React, { useEffect, useRef, useState } from "react";
import styles from "./Toast.module.css";
import classNames from "classnames/bind";
import { useToast, type ToastPropsWithId } from "./ToastContext";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import { useTheme } from "~/context/ThemeContext";

const cx = classNames.bind(styles);

interface ToastContainerProps {
  children: React.ReactNode;
}
const ToastContainer: React.FC<ToastContainerProps> = ({ children }) => {
  return <div className={styles.toastContainer}>{children}</div>;
};

const CountdownSvg = ({
  trackColour = "#ffffff",
  progressColour = "#ff00ff",
  percent = 100, // 100 = full circle (all time remaining), 0 = empty
}) => {
  const HundredPercent = 125.66370614359172;
  const percentValue = ((100 - percent) * HundredPercent) / 100;
  // const percentValue = (percent * HundredPercent) / 100;

  return (
    <svg viewBox="0 0 50 50" className={styles.countdownSvg}>
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke={trackColour}
        strokeWidth="10"
        className={styles.progressCircleTrack}
      ></circle>
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke={progressColour}
        strokeDasharray="125.66370614359172 125.66370614359172"
        // strokeDashoffset="0" // = 0%
        // strokeDashoffset="125.66370614359172" // = 100%
        strokeDashoffset={percentValue}
        strokeWidth="10"
        className={styles.progressCircleIndicator}
        transform="rotate(-90 25 25)"
      ></circle>
    </svg>
  );
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

  const [pct, setPct] = useState(100);
  const rafRef = useRef<number | null>(null);

  // Drive the countdown SVG from 100 → 0 over expireTimeSeconds
  useEffect(() => {
    if (!autoExpire) return;
    const start = Date.now();
    const totalMs = expireTimeSeconds * 1000;

    const tick = () => {
      const remaining = Math.max(0, 1 - (Date.now() - start) / totalMs);
      setPct(remaining * 100);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [id, autoExpire, expireTimeSeconds]);

  // Remove the toast once the timer expires
  useEffect(() => {
    if (!autoExpire) return;
    const timer = setTimeout(() => removeToast(id), expireTimeSeconds * 1000);
    return () => clearTimeout(timer);
  }, [id, autoExpire, expireTimeSeconds, removeToast]);

  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const countdownConfig = {
    primary: {
      trackColour: isDarkMode ? "var(--flamingo)" : "var(--blue-ribbon)",
      progressColour: "var(--white)",
    },
    secondary: {
      trackColour: "var(--white)",
      progressColour: isDarkMode ? "var(--flamingo)" : "var(--blue-ribbon)",
    },
    danger: {
      trackColour: "var(--cinnabar)",
      progressColour: "var(--white)",
    },
  };

  return (
    <div className={toastClasses}>
      <div className={styles.toastHeaderContainer}>
        <span className={styles.toastHeader}>{heading}</span>
        <div className={styles.closeButtonContainer}>
          {autoExpire && (
            <CountdownSvg percent={pct} {...countdownConfig[variant]} />
          )}
          <button
            type="button"
            onClick={() => removeToast(id)}
            className={styles.closeButton}
          >
            <SvgIcon name={SvgImageList.Close} fill="white" />
          </button>
        </div>
      </div>
      {content && <div className={styles.toastContent}>{content}</div>}
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
