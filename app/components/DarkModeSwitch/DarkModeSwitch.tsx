import React from "react";
import styles from "./DarkModeSwitch.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";

interface DarkModeSwitch {
  toggleDarkMode: () => void;
  darkMode: boolean;
}

const DarkModeSwitch: React.FC<DarkModeSwitch> = ({
  toggleDarkMode,
  darkMode,
}) => {
  return (
    <div
      className={`${styles.darkModeSwitchContainer} ${
        darkMode ? styles.darkMode : styles.lightMode
      }`}
      onClick={() => toggleDarkMode()}
    >
      <SvgIcon name={SvgImageList.DarkMode} fill="#d8d8d8" />
      <div className={styles.darkModeSwitch}></div>
      <SvgIcon name={SvgImageList.LightMode} fill="#ffdb00" />
    </div>
  );
};

export default DarkModeSwitch;
