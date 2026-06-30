import { useState } from "react";
import { Button } from "~/components/Button/Button";
import { ImagePickerModal } from "~/components/ImagePickerModal/ImagePickerModal";
import { useModal } from "~/components/Modal/useModal";
import styles from "./ImagePicker.module.css";

type Props = {
  name: string;
  label?: string;
  defaultValue?: string;
  onChange?: (url: string) => void;
  variant?: "wide" | "square";
};

export function ImagePicker({
  name,
  label,
  defaultValue,
  onChange,
  variant = "wide",
}: Props) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const { isOpen, open, close } = useModal();

  function handlePick(src: string) {
    setUrl(src);
    onChange?.(src);
  }

  function handleClear() {
    setUrl("");
    onChange?.("");
  }

  const sizeClass = variant === "square" ? styles.square : styles.wide;

  return (
    <div className={styles.wrapper}>
      {label && <span className={styles.label}>{label}</span>}
      <input type="hidden" name={name} value={url} />
      {url ? (
        <div className={styles.filledContainer}>
          <div className={`${styles.imageWrap} ${sizeClass}`}>
            <img src={url} alt="" className={styles.preview} />
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={open}>
              Change Image
            </Button>
            <Button type="button" variant="danger" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.emptyPicker} ${sizeClass}`}
          onClick={open}
          aria-label={label ? `Select image for ${label}` : "Select image"}
        >
          <span className={styles.selectLabel}>Select Image</span>
        </button>
      )}
      <ImagePickerModal isOpen={isOpen} onClose={close} onPick={handlePick} />
    </div>
  );
}
