import React, { useState, useEffect, useRef } from "react";
import { uniqueId } from "../utils";
import styles from "./OverflowMenu.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";

interface OverflowMenuProps {
  children: React.ReactNode;
}

const OverflowMenu: React.FC<OverflowMenuProps> = ({ children }) => {
  const randomId = uniqueId();
  const buttonStyleAnchor = {
    anchorName: `--overflow-menu_${randomId}`,
  };
  const menuStyleAnchor = {
    positionAnchor: `--overflow-menu_${randomId}`,
  };

  const [active, setActive] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setActive(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [active]);

  return (
    <>
      <button
        ref={buttonRef}
        className={styles.overflowButton}
        style={buttonStyleAnchor}
        onClick={() => setActive((isActive) => !isActive)}
      >
        <SvgIcon name={SvgImageList.ThreeDots} />
      </button>
      {active && (
        <div
          ref={menuRef}
          className={styles.overflowMenu}
          style={menuStyleAnchor}
          onClick={() => setActive(false)}
        >
          {children}
        </div>
      )}
    </>
  );
};

export default OverflowMenu;
