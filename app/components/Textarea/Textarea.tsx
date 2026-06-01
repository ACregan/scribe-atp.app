import styles from "./Textarea.module.css";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export function Textarea({ label, error, id, ...props }: TextareaProps) {
  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={`${styles.textarea}${error ? ` ${styles.textareaError}` : ""}`}
        {...props}
      />
      <div className={styles.errorContainer}>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}
