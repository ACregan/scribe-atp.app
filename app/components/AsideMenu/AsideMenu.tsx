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
  },
  {
    id: "article-list",
    icon: SvgImageList.Documents,
    label: "Articles",
    to: "/article/list",
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
];

interface AsideMenuProps {
  expanded: boolean;
  onToggle: () => void;
}

const AsideMenuItem: React.FC<AsideMenuItemConfig & { expanded: boolean }> = ({
  id,
  icon,
  label,
  to,
  expanded,
}) => {
  const iconEl = (
    <span className={styles.menuItemIconWrapper}>
      <SvgIcon name={icon} fill="var(--aside-color)" />
    </span>
  );

  return (
    <NavLink
      to={to}
      className={`${styles.menuItemLink}${expanded ? ` ${styles.menuItemLinkExpanded}` : ""}`}
      aria-label={expanded ? undefined : label}
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

const AsideMenu: React.FC<AsideMenuProps> = ({ expanded, onToggle }) => {
  return (
    <aside className={styles.asideElement}>
      <div className={styles.topButtonContainer}>
        {MENU_CONFIG.map((menuItem) => (
          <AsideMenuItem key={menuItem.id} {...menuItem} expanded={expanded} />
        ))}
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
