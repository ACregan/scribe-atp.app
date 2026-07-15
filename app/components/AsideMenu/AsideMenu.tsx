import React from "react";
import styles from "./AsideMenu.module.css";
import { Form, NavLink } from "react-router";
import Tooltip, { TooltipBubble } from "../Tooltip/Tooltip";
import type { SvgImageListTypes } from "../SvgIcon/SvgIcon";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import { Button } from "../Button/Button";

interface AsideMenuItemConfig {
  id: string;
  icon: SvgImageListTypes;
  label: string;
  to: string;
  /** When true, the item requires at least one site to exist before it's usable. */
  requiresSite?: boolean;
  /** When true, the item requires at least one article to exist before it's usable. */
  requiresArticle?: boolean;
  disabledReason?: string;
}

const MENU_CONFIG: AsideMenuItemConfig[] = [
  { id: "home", icon: SvgImageList.Home, label: "Dashboard", to: "/" },
  {
    id: "site-management",
    icon: SvgImageList.Website,
    label: "Sites",
    to: "/sites",
  },
  {
    id: "group-list",
    icon: SvgImageList.Folder,
    label: "Groups",
    to: "/groups",
    requiresSite: true,
    disabledReason: "Add a Site to enable",
  },
  {
    id: "article-list",
    icon: SvgImageList.Documents,
    label: "Articles",
    to: "/article/list",
    requiresArticle: true,
    disabledReason: "Create an article to enable",
  },
  {
    id: "create-article",
    icon: SvgImageList.Document,
    label: "Create New Article",
    to: "/article/create",
  },
  {
    id: "image-library",
    icon: SvgImageList.Image,
    label: "Image Library",
    to: "/images",
  },
  {
    id: "insights",
    icon: SvgImageList.BarChart,
    label: "Insights",
    to: "/insights",
    requiresSite: true,
    disabledReason: "Add a Site to enable",
  },
];

interface AsideMenuProps {
  expanded: boolean;
  onToggle: () => void;
  hasSites: boolean;
  hasArticles: boolean;
  /** Phase 4 — total pending Contributor submissions across the Owner's sites. */
  pendingSubmissionsCount?: number;
}

const AsideMenuItem: React.FC<
  AsideMenuItemConfig & {
    expanded: boolean;
    disabled: boolean;
    badgeCount?: number;
  }
> = ({ id, icon, label, to, expanded, disabled, disabledReason, badgeCount }) => {
  const iconEl = (
    <span className={styles.menuItemIconWrapper}>
      <SvgIcon name={icon} fill="var(--aside-color)" />
      {!!badgeCount && (
        <span className={styles.menuItemBadge} aria-hidden="true">
          {badgeCount}
        </span>
      )}
    </span>
  );

  if (disabled) {
    return (
      <Tooltip
        anchorName={id}
        anchorPosition="right"
        anchorContent={
          <TooltipBubble pointerLocation="left">
            <strong>{label}</strong>
            {disabledReason && (
              <div className={styles.disabledReason}>{disabledReason}</div>
            )}
          </TooltipBubble>
        }
      >
        <span
          className={`${styles.menuItemLink} ${styles.menuItemLinkDisabled}${expanded ? ` ${styles.menuItemLinkExpanded}` : ""}`}
          aria-disabled="true"
          aria-label={disabledReason ? `${label} — ${disabledReason}` : label}
        >
          {iconEl}
          <span
            className={`${styles.menuItemLabel}${!expanded ? ` ${styles.menuItemLabelHidden}` : ""}`}
          >
            {label}
          </span>
        </span>
      </Tooltip>
    );
  }

  return (
    <NavLink
      to={to}
      className={`${styles.menuItemLink}${expanded ? ` ${styles.menuItemLinkExpanded}` : ""}`}
      aria-label={
        badgeCount
          ? `${label} (${badgeCount} pending)`
          : expanded
            ? undefined
            : label
      }
    >
      {expanded ? (
        iconEl
      ) : (
        <Tooltip
          anchorName={id}
          anchorPosition="right"
          anchorContent={
            <TooltipBubble pointerLocation="left">
              <strong>{label}</strong>
            </TooltipBubble>
          }
        >
          {iconEl}
        </Tooltip>
      )}
      <span
        className={`${styles.menuItemLabel}${!expanded ? ` ${styles.menuItemLabelHidden}` : ""}`}
      >
        {label}
      </span>
    </NavLink>
  );
};

const AsideMenu: React.FC<AsideMenuProps> = ({
  expanded,
  onToggle,
  hasSites,
  hasArticles,
  pendingSubmissionsCount,
}) => {
  return (
    <aside className={styles.asideElement}>
      <div className={styles.topButtonContainer}>
        {MENU_CONFIG.map((menuItem) => {
          const disabled = Boolean(
            (menuItem.requiresSite && !hasSites) ||
              (menuItem.requiresArticle && !hasArticles),
          );
          return (
            <AsideMenuItem
              key={menuItem.id}
              {...menuItem}
              expanded={expanded}
              disabled={disabled}
              badgeCount={
                menuItem.id === "site-management"
                  ? pendingSubmissionsCount
                  : undefined
              }
            />
          );
        })}
      </div>
      <div className={styles.bottomButtonContainer}>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={onToggle}
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
        >
          <span
            className={
              expanded ? styles.toggleChevronExpanded : styles.toggleChevron
            }
          >
            <SvgIcon
              name={SvgImageList.ChevronDown}
              fill="var(--aside-color)"
            />
          </span>
        </button>
        <Form method="post" action="/logout">
          <Tooltip
            anchorName={"logout-button"}
            anchorPosition="right"
            anchorContent={
              <TooltipBubble pointerLocation="left">
                <strong>Logout</strong>
              </TooltipBubble>
            }
          >
            <Button
              type="submit"
              aria-label="Logout"
              variant="danger"
              className={styles.exitButton}
            >
              <span className={styles.menuItemIconWrapper}>
                <SvgIcon name={SvgImageList.Exit} fill="white" />
              </span>
              <span
                className={`${styles.menuItemLabel}${!expanded ? ` ${styles.menuItemLabelHidden}` : ""}`}
              >
                Logout
              </span>
            </Button>
          </Tooltip>
        </Form>
      </div>
    </aside>
  );
};

export default AsideMenu;
