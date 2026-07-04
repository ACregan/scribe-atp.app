import React, { useEffect, useRef, useState } from "react";
import styles from "./Collapsible.module.css";

interface CollapsibleProps {
  summary: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
}

type Phase = "closed" | "opening" | "open" | "closing";

const Collapsible: React.FC<CollapsibleProps> = ({
  summary,
  children,
  open = false,
}) => {
  const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");
  const scheduledRef = useRef(false);

  useEffect(() => {
    if (phase !== "opening") return;
    scheduledRef.current = true;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (scheduledRef.current) setPhase("open");
      }),
    );
    return () => {
      cancelAnimationFrame(id);
      scheduledRef.current = false;
    };
  }, [phase]);

  const handleSummaryClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (phase === "open") setPhase("closing");
    else if (phase === "closed") setPhase("opening");
  };

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (phase === "closing" && e.propertyName === "grid-template-rows") {
      setPhase("closed");
    }
  };

  return (
    <details className={styles.details} open={phase !== "closed"}>
      <summary className={styles.summary} onClick={handleSummaryClick}>
        {summary}
      </summary>
      <div
        className={`${styles.content} ${phase === "open" ? styles.contentOpen : ""} ${phase === "closed" ? styles.contentClosed : ""}`}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className={styles.inner}>{children}</div>
      </div>
    </details>
  );
};

export default Collapsible;
