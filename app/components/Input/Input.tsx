import styles from "./Input.module.css";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, id, ...props }: InputProps) {
  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <input
        id={id}
        className={`${styles.input}${error ? ` ${styles.inputError}` : ""}`}
        {...props}
      />
      <div className={styles.errorContainer}>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}
