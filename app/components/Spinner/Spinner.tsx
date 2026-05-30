import styles from "./Spinner.module.css";

type SpinnerProps = {
  overlay?: boolean;
};

export function Spinner({ overlay = false }: SpinnerProps) {
  if (overlay) {
    return (
      <div className={styles.overlay}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return <div className={styles.spinner} />;
}
