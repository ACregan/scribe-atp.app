import React from "react";
import cn from "classnames";
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
  fill?: boolean;
}
const PageSection: React.FC<PageSectionProps> = ({
  children,
  overflow = false,
  fill = false,
}) => {
  const className = overflow
    ? styles.pageSectionWithOverflow
    : fill
      ? styles.pageSectionFill
      : styles.pageSection;
  return <div className={className}>{children}</div>;
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
type Breakpoint = "sm" | "md" | "lg" | "xl" | "2xl";

const breakpointClass: Record<Breakpoint, string> = {
  sm: styles.columnsBreakpointSm,
  md: styles.columnsBreakpointMd,
  lg: styles.columnsBreakpointLg,
  xl: styles.columnsBreakpointXl,
  "2xl": styles.columnsBreakpoint2xl,
};

interface PageSectionColumnsProps {
  children: React.ReactNode;
  breakpoint?: Breakpoint;
}
const PageSectionColumns: React.FC<PageSectionColumnsProps> = ({
  children,
  breakpoint = "md",
}) => {
  return (
    <div className={cn(styles.columns, breakpointClass[breakpoint])}>
      {children}
    </div>
  );
};

interface PageSectionColumnProps {
  children: React.ReactNode;
  span: number;
  overflow?: boolean;
}
const PageSectionColumn: React.FC<PageSectionColumnProps> = ({
  children,
  span,
  overflow = false,
}) => {
  return (
    <div
      className={overflow ? styles.columnOverflow : styles.column}
      style={{ gridColumn: `span ${span}` }}
    >
      {children}
    </div>
  );
};

export {
  PageContainerHeading,
  PageContainer,
  PageSection,
  PageSectionCell,
  ButtonGroupContainer,
  PageSectionColumns,
  PageSectionColumn,
};
