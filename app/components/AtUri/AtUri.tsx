import SvgIcon, { SvgImageList } from "../SvgIcon/SvgIcon";
import styles from "./AtUri.module.css";

type AtUriProps = {
  uri: string;
};

const AtUri = ({ uri }: AtUriProps) => {
  const href = `https://www.atproto-browser.dev/at/${uri.replace("at://", "")}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={uri}
      className={styles.link}
    >
      <SvgIcon name={SvgImageList.ATProtoLogo} className={styles.icon} />
    </a>
  );
};

export default AtUri;
