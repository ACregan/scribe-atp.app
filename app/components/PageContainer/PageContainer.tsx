import React from "react";
import styles from "./PageContainer.module.css";
import SvgIcon, { type SvgImageListTypes } from "../SvgIcon/SvgIcon";

interface PageContainerHeadingProps {
  icon: SvgImageListTypes;
  children: React.ReactNode;
}

const PageContainerHeading: React.FC<PageContainerHeadingProps> = ({
  icon,
  children,
}) => {
  return (
    <div className={styles.pageHeadingContainer}>
      {icon && (
        <div className={styles.headingIconContainer}>
          <SvgIcon name={icon} fill="var(--white)" />
        </div>
      )}
      <h1>{children}</h1>
    </div>
  );
};

interface PageContainerProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  topButtons?: React.ReactNode;
  bottomButtons?: React.ReactNode;
  fixed?: boolean;
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  title,
  topButtons,
  bottomButtons,
  fixed = false,
}) => {
  return (
    <div className={fixed ? styles.fixedPageContainer : styles.pageContainer}>
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
  overflow?: boolean;
}
const PageSection: React.FC<PageSectionProps> = ({
  children,
  overflow = false,
}) => {
  return (
    <div
      className={overflow ? styles.pageSectionWithOverflow : styles.pageSection}
    >
      {children}
    </div>
  );
};
interface PageSectionRowProps {
  children: React.ReactNode;
}
const PageSectionCell: React.FC<PageSectionRowProps> = ({ children }) => {
  return <div className={styles.pageSectionCell}>{children}</div>;
};

interface ButtonGroupContainerProps {
  children: React.ReactNode;
}
const ButtonGroupContainer: React.FC<ButtonGroupContainerProps> = ({
  children,
}) => {
  return <div className={styles.buttonGroupContainer}>{children}</div>;
};
export {
  PageContainerHeading,
  PageContainer,
  PageSection,
  PageSectionCell,
  ButtonGroupContainer,
};
