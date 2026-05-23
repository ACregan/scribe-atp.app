import React from "react";
import styles from "./GroupList.module.css";

interface GroupListProps {
  children: React.ReactNode;
}

const GroupList: React.FC<GroupListProps> = ({ children }) => {
  return <ul className={styles.groupList}>{children}</ul>;
};

export default GroupList;
