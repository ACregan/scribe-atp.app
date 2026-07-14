import React from "react";
import cn from "classnames";
import styles from "./Table.module.css";

export type ColumnDef<T> = {
  header: string;
  accessor: (row: T) => React.ReactNode;
};

interface TableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  layout?: "columns" | "rows";
  className?: string;
}

function Table<T>({
  data,
  columns,
  layout = "columns",
  className,
}: TableProps<T>) {
  if (layout === "rows") {
    return (
      <table className={cn(styles.table, className)}>
        <tbody>
          {columns.map((col) => (
            <tr key={col.header} className={styles.tr}>
              <th className={styles.th}>{col.header}</th>
              {data.map((row, i) => (
                <td key={i} className={styles.td}>
                  {col.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className={cn(styles.table, className)}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.header} className={styles.th}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className={styles.tr}>
            {columns.map((col) => (
              <td key={col.header} className={styles.td}>
                {col.accessor(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default Table;
