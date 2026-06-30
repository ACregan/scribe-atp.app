import styles from "./SaveChecklist.module.css";
import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";

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

const Tick = () => {
  return (
    <div className={styles.tickContainer}>
      <SvgIcon name={SvgImageList.Tick} className={styles.icon} />
    </div>
  );
};
const Cross = () => {
  return (
    <div className={styles.crossContainer}>
      <SvgIcon name={SvgImageList.Cross} className={styles.icon} />
    </div>
  );
};

function CheckItem({
  label,
  satisfied,
}: {
  label: string;
  satisfied: boolean;
}) {
  return (
    <span className={satisfied ? styles.satisfied : styles.missing}>
      {satisfied ? <Tick /> : <Cross />} <span>{label}</span>
    </span>
  );
}
