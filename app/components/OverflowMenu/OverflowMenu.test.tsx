import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import OverflowMenu from "./OverflowMenu";

vi.mock("../utils", () => ({
  uniqueId: () => "test-id",
}));

vi.mock("../SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => (
    <svg data-testid="svg-icon" data-icon={name} />
  ),
  SvgImageList: { ThreeDots: "ThreeDots" },
}));

describe("OverflowMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trigger button", () => {
    render(
      <OverflowMenu>
        <span>Item</span>
      </OverflowMenu>,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders the ThreeDots icon inside the trigger", () => {
    const { container } = render(
      <OverflowMenu>
        <span>Item</span>
      </OverflowMenu>,
    );
    expect(
      container.querySelector('[data-icon="ThreeDots"]'),
    ).toBeInTheDocument();
  });

  it("does not render children when closed", () => {
    render(
      <OverflowMenu>
        <span>Menu Item</span>
      </OverflowMenu>,
    );
    expect(screen.queryByText("Menu Item")).not.toBeInTheDocument();
  });

  it("renders children when the trigger is clicked", () => {
    render(
      <OverflowMenu>
        <span>Menu Item</span>
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Menu Item")).toBeInTheDocument();
  });

  it("closes the menu when the trigger is clicked again", () => {
    render(
      <OverflowMenu>
        <span>Menu Item</span>
      </OverflowMenu>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByText("Menu Item")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByText("Menu Item")).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside both the trigger and the menu", () => {
    render(
      <div>
        <OverflowMenu>
          <span>Menu Item</span>
        </OverflowMenu>
        <div data-testid="outside">Outside</div>
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Menu Item")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Menu Item")).not.toBeInTheDocument();
  });

  it("does not close the menu when mousedown fires on the trigger itself", () => {
    render(
      <OverflowMenu>
        <span>Menu Item</span>
      </OverflowMenu>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getByText("Menu Item")).toBeInTheDocument();
    fireEvent.mouseDown(trigger);
    expect(screen.getByText("Menu Item")).toBeInTheDocument();
  });

  it("closes the menu when an item inside it is clicked", () => {
    render(
      <OverflowMenu>
        <button>Action</button>
      </OverflowMenu>,
    );
    const trigger = screen.getByRole("button", { name: "" });
    fireEvent.click(trigger);
    const action = screen.getByRole("button", { name: "Action" });
    expect(action).toBeInTheDocument();
    fireEvent.click(action);
    expect(
      screen.queryByRole("button", { name: "Action" }),
    ).not.toBeInTheDocument();
  });

  it("applies anchor name style to the trigger button", () => {
    const { container } = render(
      <OverflowMenu>
        <span>Item</span>
      </OverflowMenu>,
    );
    const button = container.querySelector("button");
    expect(button?.style.anchorName).toBe("--overflow-menu_test-id");
  });
});
