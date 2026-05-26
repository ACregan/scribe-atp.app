import React from "react";
import styles from "./AsideMenu.module.css";
import { Form, NavLink } from "react-router";
import Tooltip, { TooltipBubble } from "../Tooltip/Tooltip";
import type { SvgImageListTypes } from "../SvgIcon/SvgIcon";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import { Button } from "../Button/Button";

interface AsideMenuItemProps {
  id: string;
  icon: SvgImageListTypes;
  label: React.ReactNode;
  to: string;
}
const AsideMenuItem: React.FC<AsideMenuItemProps> = ({
  id,
  icon,
  label,
  to,
}) => {
  return (
    <NavLink to={to} className={styles.menuItemLink}>
      <Tooltip
        anchorName={id}
        anchorPosition="right"
        anchorContent={
          <TooltipBubble pointerLocation="left">
            <strong>{label}</strong>
          </TooltipBubble>
        }
      >
        <button>
          <SvgIcon name={icon} />
        </button>
      </Tooltip>
    </NavLink>
  );
};

const MENU_CONFIG: AsideMenuItemProps[] = [
  {
    id: "home",
    icon: SvgImageList.Home,
    label: "Dashboard",
    to: "/",
  },
  {
    id: "site-management",
    icon: SvgImageList.Website,
    label: "Sites",
    to: "/sites",
  },
  {
    id: "article-list",
    icon: SvgImageList.Documents,
    label: "Article List",
    to: "/sites",
  },
  {
    id: "create-article",
    icon: SvgImageList.Document,
    label: "Create New Article",
    to: "/article/create",
  },
];

const AsideMenu = () => {
  return (
    <aside className={styles.asideElement}>
      <div className={styles.topButtonContainer}>
        {MENU_CONFIG.map((menuItem) => (
          <AsideMenuItem
            key={menuItem.id}
            id={menuItem.id}
            icon={menuItem.icon}
            label={menuItem.label}
            to={menuItem.to}
          />
        ))}
      </div>
      <div className={styles.bottomButtonContainer}>
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
              variant="danger"
              className={styles.exitButton}
            >
              <SvgIcon name={SvgImageList.Exit} fill="white" />
            </Button>
          </Tooltip>
        </Form>
      </div>
    </aside>
  );
};

export default AsideMenu;
