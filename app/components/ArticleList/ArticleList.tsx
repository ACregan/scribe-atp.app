import React from "react";
import styles from "./ArticleList.module.css";

interface ArticleListProps {
  children: React.ReactNode;
}
const ArticleList: React.FC<ArticleListProps> = ({ children }) => {
  return <ul className={styles.articleList}>{children}</ul>;
};

export default ArticleList;
