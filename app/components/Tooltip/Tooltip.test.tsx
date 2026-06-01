import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Tooltip, { TooltipBubble } from "./Tooltip";

describe("Tooltip", () => {
  it("renders the child element", () => {
    render(
      <Tooltip anchorName="test" anchorPosition="bottom" anchorContent={<div />}>
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByRole("button", { name: "Trigger" })).toBeInTheDocument();
  });

  it("renders anchorContent alongside the child", () => {
    render(
      <Tooltip
        anchorName="test"
        anchorPosition="bottom"
        anchorContent={<div>Tooltip text</div>}
      >
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByText("Tooltip text")).toBeInTheDocument();
  });

  it("preserves existing child styles when cloning", () => {
    render(
      <Tooltip anchorName="test" anchorPosition="bottom" anchorContent={<div />}>
        <button style={{ fontSize: "20px" }}>Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByRole("button")).toHaveStyle({ fontSize: "20px" });
  });

  it("sanitises the anchor name by lowercasing and replacing spaces with hyphens", () => {
    render(
      <Tooltip anchorName="My Anchor Name" anchorPosition="top" anchorContent={<div />}>
        <span>child</span>
      </Tooltip>,
    );
    const child = screen.getByText("child");
    // anchor-name is a CSS Anchor Positioning property set via the style prop
    const anchorName = (child.style as unknown as Record<string, unknown>)["anchorName"];
    expect(anchorName).toBe("--my-anchor-name");
  });

  it("renders multiple children when provided", () => {
    render(
      <Tooltip anchorName="test" anchorPosition="bottom" anchorContent={<div />}>
        <span>First</span>
        <span>Second</span>
      </Tooltip>,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});

describe("TooltipBubble", () => {
  it("renders children", () => {
    render(
      <TooltipBubble pointerLocation="top">
        <span>Bubble text</span>
      </TooltipBubble>,
    );
    expect(screen.getByText("Bubble text")).toBeInTheDocument();
  });

  it("renders as a div", () => {
    const { container } = render(
      <TooltipBubble pointerLocation="top">content</TooltipBubble>,
    );
    expect(container.querySelector("div")).toBeInTheDocument();
  });

  it("applies the primary variant class by default", () => {
    const { container } = render(
      <TooltipBubble pointerLocation="top">content</TooltipBubble>,
    );
    expect(container.firstElementChild?.className).toContain("primaryVariant");
  });

  it("applies the danger variant class when variant='danger'", () => {
    const { container } = render(
      <TooltipBubble pointerLocation="top" variant="danger">
        content
      </TooltipBubble>,
    );
    expect(container.firstElementChild?.className).toContain("dangerVariant");
  });

  it("applies the secondary variant class when variant='secondary'", () => {
    const { container } = render(
      <TooltipBubble pointerLocation="top" variant="secondary">
        content
      </TooltipBubble>,
    );
    expect(container.firstElementChild?.className).toContain("secondaryVariant");
  });

  it("applies a position class matching the pointerLocation", () => {
    const { container } = render(
      <TooltipBubble pointerLocation="bottom">content</TooltipBubble>,
    );
    expect(container.firstElementChild?.className).toContain("bottom");
  });
});
