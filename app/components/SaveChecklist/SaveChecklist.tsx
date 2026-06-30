import styles from "./SaveChecklist.module.css";

type Props = {
  title: boolean;
  urlSlug: boolean;
  content: boolean;
};

export function SaveChecklist({ title, urlSlug, content }: Props) {
  return (
    <span className={styles.list}>
      <CheckItem label="Title" satisfied={title} />
      <CheckItem label="URL slug" satisfied={urlSlug} />
      <CheckItem label="Content" satisfied={content} />
    </span>
  );
}

function CheckItem({ label, satisfied }: { label: string; satisfied: boolean }) {
  return (
    <span className={satisfied ? styles.satisfied : styles.missing}>
      {satisfied ? "✓" : "✗"} {label}
    </span>
  );
}
