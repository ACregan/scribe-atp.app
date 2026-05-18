import styles from "./Button.module.css";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
