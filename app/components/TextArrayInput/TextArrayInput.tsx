import type React from "react";
import { useState } from "react";
import styles from "./TextArrayInput.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";

type TextArrayInputProps = {
  id: string;
  label?: string;
  placeholder?: string;
  textArrayItems: string[];
  setTextArrayItems: React.Dispatch<React.SetStateAction<string[]>>;
};

const TextArrayInput = ({
  id,
  label,
  placeholder,
  textArrayItems,
  setTextArrayItems,
}: TextArrayInputProps) => {
  const [textInput, setTextInput] = useState<string>("");

  const enterTextIntoTextInput = (event: any) => {
    setTextInput(event.currentTarget.value);
  };

  const addTextToTextArray = (text: string) => {
    const isAlreadyInArray = textArrayItems.some((item) => item === text);
    if (!isAlreadyInArray && text !== "") {
      setTextArrayItems([...textArrayItems, text]);
    }
  };

  const handleKeyDown = (event: any) => {
    if (event.key === "Enter") {
      addTextToTextArray(textInput);
      setTextInput("");
    }
    if (event.key === "Escape") {
      setTextInput("");
    }
  };

  const removeItemFromTextArray = (itemToBeRemoved: string) => {
    const arrayWithoutItem = textArrayItems.filter(
      (item) => item !== itemToBeRemoved,
    );
    setTextArrayItems(arrayWithoutItem);
  };

  return (
    <div className={styles.container}>
      {label ? <label htmlFor={id}>{label}</label> : null}
      <div className={styles.inputContainer}>
        <div className={styles.inputWrapper}>
          <input
            type="text"
            id={id}
            value={textInput}
            placeholder={placeholder}
            onChange={(e) => {
              e.preventDefault();
              enterTextIntoTextInput(e);
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            className={styles.addButton}
            data-testid="add-button"
            type="button"
            onClick={() => addTextToTextArray(textInput)}
          >
            <SvgIcon name={SvgImageList.Plus} />
          </button>
        </div>
        <div className={styles.textArrayItemContainer}>
          {textArrayItems.map((textItem) => {
            return (
              <p className={styles.textArrayItem} key={textItem}>
                {textItem}{" "}
                <button
                  className={styles.removeButton}
                  data-testid="remove-button"
                  type="button"
                  onClick={() => removeItemFromTextArray(textItem)}
                >
                  <SvgIcon
                    name={SvgImageList.Cross}
                    fill="hsl(216, 100%, 50%)"
                  />
                </button>
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TextArrayInput;
