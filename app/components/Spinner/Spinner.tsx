import styles from "./Spinner.module.css";
import classNames from "classnames/bind";

const cx = classNames.bind(styles);

type SpinnerProps = {
  overlay?: boolean;
  size?: "small" | "medium" | "large";
};

export function Spinner({ overlay = false, size = "medium" }: SpinnerProps) {
  const spinnerClasses = cx({
    spinner: true,
    small: size === "small",
    medium: size === "medium",
    large: size === "large",
  });

  if (overlay) {
    return (
      <div className={styles.overlay}>
        <div className={spinnerClasses} />
      </div>
    );
  }

  return <div className={spinnerClasses} />;
}
