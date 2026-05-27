import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

type BaseProps = {
  id?: string;
  name: string;
  label?: string;
  error?: string;
  options: SelectOption[];
};

type SingleProps = BaseProps & {
  multiple?: false;
  value?: string;
  onChange?: (value: string) => void;
};

type MultipleProps = BaseProps & {
  multiple: true;
  value?: string[];
  onChange?: (value: string[]) => void;
};

type SelectProps = SingleProps | MultipleProps;

export function Select(props: SelectProps) {
  const { id, name, label, error, options } = props;

  if (props.multiple) {
    const selected = props.value ?? [];

    const handleChange = (optionValue: string, checked: boolean) => {
      if (!props.onChange) return;
      if (checked) {
        props.onChange([...selected, optionValue]);
      } else {
        props.onChange(selected.filter((v) => v !== optionValue));
      }
    };

    return (
      <div className={styles.field}>
        {label && <span className={styles.label}>{label}</span>}
        <div className={`${styles.checkboxList}${error ? ` ${styles.checkboxListError}` : ""}`}>
          {options.map((option) => {
            const checked = selected.includes(option.value);
            const inputId = id ? `${id}-${option.value}` : `${name}-${option.value}`;
            return (
              <label key={option.value} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  name={name}
                  value={option.value}
                  checked={checked}
                  onChange={(e) => handleChange(option.value, e.target.checked)}
                  className={styles.checkbox}
                  id={inputId}
                />
                {option.label}
              </label>
            );
          })}
          {options.length === 0 && (
            <span className={styles.empty}>No options available</span>
          )}
        </div>
        <div className={styles.errorContainer}>
          {error && <span className={styles.error}>{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <select
        id={id}
        name={name}
        value={props.value ?? ""}
        onChange={(e) => props.onChange?.(e.target.value)}
        className={`${styles.select}${error ? ` ${styles.selectError}` : ""}`}
      >
        <option value="" disabled>
          Select an option
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className={styles.errorContainer}>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}
