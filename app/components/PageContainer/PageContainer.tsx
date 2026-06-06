import React from "react";
import cn from "classnames";
import styles from "./PageContainer.module.css";
import SvgIcon, { type SvgImageListTypes } from "../SvgIcon/SvgIcon";

interface PageContainerHeadingProps {
  icon: SvgImageListTypes;
  children: React.ReactNode;
  className?: string;
}

const PageContainerHeading: React.FC<PageContainerHeadingProps> = ({
  icon,
  children,
  className,
}) => {
  return (
    <div className={cn(styles.pageHeadingContainer, className)}>
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
  className?: string;
}

const PageContainer: React.FC<PageContainerProps> = ({
  children,
  title,
  topButtons,
  bottomButtons,
  fixed = false,
  className,
}) => {
  return (
    <div
      className={cn(
        fixed ? styles.fixedPageContainer : styles.pageContainer,
        className,
      )}
    >
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
  className?: string;
}
const PageSection: React.FC<PageSectionProps> = ({
  children,
  overflow = false,
  fill = false,
  className,
}) => {
  const baseClass = overflow
    ? styles.pageSectionWithOverflow
    : fill
      ? styles.pageSectionFill
      : styles.pageSection;
  return <div className={cn(baseClass, className)}>{children}</div>;
};

interface PageSectionCellProps {
  children: React.ReactNode;
  className?: string;
}
const PageSectionCell: React.FC<PageSectionCellProps> = ({
  children,
  className,
}) => {
  return <div className={cn(styles.pageSectionCell, className)}>{children}</div>;
};

interface ButtonGroupContainerProps {
  children: React.ReactNode;
  className?: string;
}
const ButtonGroupContainer: React.FC<ButtonGroupContainerProps> = ({
  children,
  className,
}) => {
  return (
    <div className={cn(styles.buttonGroupContainer, className)}>{children}</div>
  );
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
  className?: string;
}
const PageSectionColumns: React.FC<PageSectionColumnsProps> = ({
  children,
  breakpoint = "md",
  className,
}) => {
  return (
    <div
      className={cn(styles.columns, breakpointClass[breakpoint], className)}
    >
      {children}
    </div>
  );
};

interface PageSectionColumnProps {
  children: React.ReactNode;
  span: number;
  overflow?: boolean;
  className?: string;
}
const PageSectionColumn: React.FC<PageSectionColumnProps> = ({
  children,
  span,
  overflow = false,
  className,
}) => {
  return (
    <div
      className={cn(
        overflow ? styles.columnOverflow : styles.column,
        className,
      )}
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
