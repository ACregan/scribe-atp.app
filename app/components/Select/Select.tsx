import { useState, useEffect, useRef } from "react";
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

function MultiSelect({ id, name, label, error, options, value, onChange }: MultipleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = value ?? [];

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleChange = (optionValue: string, checked: boolean) => {
    if (!onChange) return;
    if (checked) {
      onChange([...selected, optionValue]);
    } else {
      onChange(selected.filter((v) => v !== optionValue));
    }
  };

  const triggerLabel =
    selected.length === 0
      ? "Select options"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div className={styles.field}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.multiSelectWrapper} ref={wrapperRef}>
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className={`${styles.trigger}${isOpen ? ` ${styles.triggerOpen}` : ""}${error ? ` ${styles.triggerError}` : ""}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className={styles.triggerLabel}>{triggerLabel}</span>
          <span
            className={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ""}`}
            aria-hidden="true"
          />
        </button>
        {isOpen && (
          <div className={styles.dropdown}>
            {options.length === 0 ? (
              <span className={styles.empty}>No options available</span>
            ) : (
              options.map((option) => {
                const checked = selected.includes(option.value);
                const inputId = id ? `${id}-${option.value}` : `${name}-${option.value}`;
                return (
                  <label key={option.value} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      id={inputId}
                      checked={checked}
                      onChange={(e) => handleChange(option.value, e.target.checked)}
                      className={styles.checkbox}
                    />
                    {option.label}
                  </label>
                );
              })
            )}
          </div>
        )}
        {selected.map((v) => (
          <input key={v} type="hidden" name={name} value={v} />
        ))}
      </div>
      <div className={styles.errorContainer}>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}

export function Select(props: SelectProps) {
  const { id, name, label, error, options } = props;

  if (props.multiple) {
    return <MultiSelect {...props} />;
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
