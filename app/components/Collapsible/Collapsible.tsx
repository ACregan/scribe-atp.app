import React, { useRef, useState } from "react";
import styles from "./Collapsible.module.css";

interface CollapsibleProps {
  summary: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
}

const Collapsible: React.FC<CollapsibleProps> = ({
  summary,
  children,
  open = false,
}) => {
  const [isOpen, setIsOpen] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const handleSummaryClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isOpen) {
      setIsClosing(true);
    } else {
      setIsOpen(true);
    }
  };

  const handleAnimationEnd = () => {
    if (isClosing) {
      setIsClosing(false);
      setIsOpen(false);
    }
  };

  return (
    <details ref={detailsRef} className={styles.details} open={isOpen}>
      <summary className={styles.summary} onClick={handleSummaryClick}>
        {summary}
      </summary>
      <div
        className={`${styles.content} ${isClosing ? styles.closing : ""}`}
        onAnimationEnd={handleAnimationEnd}
      >
        {children}
      </div>
    </details>
  );
};

export default Collapsible;
