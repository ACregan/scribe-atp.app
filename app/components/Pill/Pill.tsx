import styles from "./Pill.module.css";

type PillProps = {
  children: React.ReactNode;
  variant?: "default" | "primary" | "secondary" | "danger" | "success";
  className?: string;
};

export function Pill({ children, variant = "default", className }: PillProps) {
  return (
    <span
      className={`${styles.pill} ${styles[variant]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}
