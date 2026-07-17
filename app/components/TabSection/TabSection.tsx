import React, { useState } from "react";
import styles from "./TabSection.module.css";

/**
 * TAB SECTION
 */

type TabItem = {
  label: string;
  component: React.ReactNode;
};

interface TabSectionProps {
  items: TabItem[];
}

const TabSection: React.FC<TabSectionProps> = ({ items }) => {
  const [activeTab, setActiveTab] = useState(0);

  if (!items || items.length === 0) return null;

  return (
    <div className={styles.tabSectionContainer}>
      <div className={styles.tabList}>
        {items.map((item, index) => {
          return (
            <div
              className={activeTab === index ? styles.tab_selected : styles.tab}
              key={item.label}
              role="tab"
              aria-selected={activeTab === index}
              onClick={() => setActiveTab(index)}
            >
              {item.label}
            </div>
          );
        })}
      </div>
      <div className={styles.tabContent}>{items[activeTab].component}</div>
    </div>
  );
};

export default TabSection;
