import styles from "./Button.module.css";
import SvgIcon, { type SvgImageListTypes } from "~/components/SvgIcon/SvgIcon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "success";
  icon?: SvgImageListTypes;
};

export function Button({
  variant = "primary",
  icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[variant]}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {icon !== undefined && (
        <span className={styles.icon}>
          <SvgIcon name={icon} fill="currentColor" />
        </span>
      )}
      {children}
    </button>
  );
}
