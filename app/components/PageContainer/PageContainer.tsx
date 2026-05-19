import React from "react";
import styles from "./PageContainer.module.css";

interface PageContainerProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  topButtons?: React.ReactNode;
  bottomButtons?: React.ReactNode;
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  title,
  topButtons,
  bottomButtons,
}) => {
  return (
    <div className={styles.pageContainer}>
      {title && (
        <div className={styles.headingContainer}>
          {typeof title === "string" ? <h1>{title}</h1> : title}
        </div>
      )}

      {topButtons && <div className={styles.topButtonPanel}>{topButtons}</div>}

      <div className={styles.contentContainer}>{children}</div>

      {bottomButtons && (
        <div className={styles.bottomButtonPanel}>{bottomButtons}</div>
      )}
    </div>
  );
};
interface PageSectionProps {
  children: React.ReactNode;
}
const PageSection: React.FC<PageSectionProps> = ({ children }) => {
  return <div className={styles.pageSection}>{children}</div>;
};
export { PageContainer, PageSection };
