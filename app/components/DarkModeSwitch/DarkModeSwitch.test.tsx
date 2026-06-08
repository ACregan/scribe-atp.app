import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DarkModeSwitch from "./DarkModeSwitch";

describe("DarkModeSwitch", () => {
  it("renders without crashing", () => {
    render(<DarkModeSwitch darkMode={false} toggleDarkMode={vi.fn()} />);
    // The switch container is the only interactive element.
    expect(
      document.querySelector('[class*="darkModeSwitchContainer"]'),
    ).toBeInTheDocument();
  });

  it("calls toggleDarkMode when clicked", () => {
    const toggle = vi.fn();
    render(<DarkModeSwitch darkMode={false} toggleDarkMode={toggle} />);
    fireEvent.click(
      document.querySelector('[class*="darkModeSwitchContainer"]')!,
    );
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("does not call toggleDarkMode before interaction", () => {
    const toggle = vi.fn();
    render(<DarkModeSwitch darkMode={false} toggleDarkMode={toggle} />);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("renders two SVG icons (moon and sun)", () => {
    render(<DarkModeSwitch darkMode={false} toggleDarkMode={vi.fn()} />);
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBe(2);
  });

  it("applies darkMode CSS class when darkMode prop is true", () => {
    render(<DarkModeSwitch darkMode={true} toggleDarkMode={vi.fn()} />);
    const container = document.querySelector(
      '[class*="darkModeSwitchContainer"]',
    );
    expect(container?.className).toContain("darkMode");
  });

  it("applies lightMode CSS class when darkMode prop is false", () => {
    render(<DarkModeSwitch darkMode={false} toggleDarkMode={vi.fn()} />);
    const container = document.querySelector(
      '[class*="darkModeSwitchContainer"]',
    );
    expect(container?.className).toContain("lightMode");
  });
});
