import styles from "./IconBadge.module.css";
import SvgIcon, { type SvgImageListTypes } from "~/components/SvgIcon/SvgIcon";

type IconBadgeProps = {
  icon: SvgImageListTypes;
  size?: "small" | "large";
};

export function IconBadge({ icon, size = "small" }: IconBadgeProps) {
  return (
    <div className={`${styles.badge} ${styles[size]}`}>
      <SvgIcon name={icon} fill="var(--white)" />
    </div>
  );
}
