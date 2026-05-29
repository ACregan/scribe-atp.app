import React, {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type CSSProperties,
} from "react";
import classNames from "classnames/bind";

import styles from "./Tooltip.module.css";

const cx = classNames.bind(styles);

type AnchorPositionTypes =
  | "top"
  | "center"
  | "bottom"
  | "left"
  | "right"
  | "top left"
  | "top right"
  | "left top"
  | "right top"
  | "bottom left"
  | "bottom right"
  | "left bottom"
  | "right bottom";

interface TooltipProps {
  children: ReactNode;
  anchorName: string;
  anchorContent: ReactNode;
  anchorPosition: AnchorPositionTypes;
  zIndex?: string;
}

const Tooltip: React.FC<TooltipProps> = ({
  children,
  anchorName,
  anchorContent,
  anchorPosition,
  zIndex = 500,
}) => {
  const sanitisedAnchorName = anchorName.replaceAll(" ", "-").toLowerCase();
  return (
    <>
      {Children.map(children, (child) => {
        if (
          isValidElement<{ style?: CSSProperties; className?: string }>(child)
        ) {
          return cloneElement(child, {
            style: {
              ...child.props.style,
              anchorName: `--${sanitisedAnchorName}`,
            },
            className: `${child.props.className} ${styles.anchoredElement}`,
          });
        }
        return child;
      })}
      <div
        className={styles.tooltipElement}
        style={{
          positionAnchor: `--${sanitisedAnchorName}`,
          positionArea: anchorPosition,
          zIndex: zIndex,
        }}
      >
        {anchorContent}
      </div>
    </>
  );
};

interface TooltipBubbleProps {
  children: ReactNode;
  pointerLocation: AnchorPositionTypes;
  variant?: "primary" | "secondary" | "danger";
}

export const TooltipBubble: React.FC<TooltipBubbleProps> = ({
  children,
  pointerLocation,
  variant = "primary",
}) => {
  const pointerClasses = cx({
    tooltipBubble: true,
    top: pointerLocation === "top",
    left: pointerLocation === "left",
    bottom: pointerLocation === "bottom",
    right: pointerLocation === "right",
    topRight:
      pointerLocation === "top right" || pointerLocation === "right top",
    topLeft: pointerLocation === "top left" || pointerLocation === "left top",
    bottomLeft:
      pointerLocation === "bottom left" || pointerLocation === "left bottom",
    bottomRight:
      pointerLocation === "bottom right" || pointerLocation === "right bottom",
    primaryVariant: variant === "primary",
    secondaryVariant: variant === "secondary",
    dangerVariant: variant === "danger",
  });
  return <div className={pointerClasses}>{children}</div>;
};

export default Tooltip;
