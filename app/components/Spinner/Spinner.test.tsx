import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders a single div inline by default (no overlay)", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelectorAll("div")).toHaveLength(1);
  });

  it("renders an overlay wrapper containing the spinner when overlay=true", () => {
    const { container } = render(<Spinner overlay />);
    const divs = container.querySelectorAll("div");
    // outer overlay div + inner spinner div
    expect(divs).toHaveLength(2);
  });

  it("applies the medium class by default", () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild?.className).toContain("medium");
  });

  it("applies the small class when size='small'", () => {
    const { container } = render(<Spinner size="small" />);
    expect(container.firstElementChild?.className).toContain("small");
  });

  it("applies the large class when size='large'", () => {
    const { container } = render(<Spinner size="large" />);
    expect(container.firstElementChild?.className).toContain("large");
  });

  it("applies the spinner class to the inner div in overlay mode", () => {
    const { container } = render(<Spinner overlay />);
    // First div is the overlay wrapper; second is the spinner ring itself.
    const divs = container.querySelectorAll("div");
    expect(divs[1]?.className).toContain("spinner");
  });
});
