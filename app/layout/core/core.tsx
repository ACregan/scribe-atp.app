import React, { useState } from "react";
import { Outlet } from "react-router";
import styles from "./core.module.css";

export default function CoreLayout() {
  return (
    <div className={styles.coreLayout_container}>
      <header></header>
      <main>
        <Outlet />
      </main>
      <footer></footer>
    </div>
  );
}
