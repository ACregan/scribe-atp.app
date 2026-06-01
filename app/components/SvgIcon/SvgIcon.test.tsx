import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SvgIcon, { SvgImageList } from "./SvgIcon";

const allIconNames = Object.keys(SvgImageList) as Array<keyof typeof SvgImageList>;

describe("SvgIcon", () => {
  it.each(allIconNames)("renders an SVG element for %s", (name) => {
    const { container } = render(<SvgIcon name={name} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a fallback paragraph for an unrecognised icon name", () => {
    render(<SvgIcon name={"NonExistent" as keyof typeof SvgImageList} />);
    expect(screen.getByText("To Err is Human")).toBeInTheDocument();
  });

  it("passes the fill prop through to the SVG", () => {
    const { container } = render(<SvgIcon name="Home" fill="red" />);
    expect(container.querySelector("svg")).toHaveAttribute("fill", "red");
  });
});
