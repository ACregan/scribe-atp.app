import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import GroupList from "./GroupList";

describe("GroupList", () => {
  it("renders as an unordered list", () => {
    const { container } = render(
      <GroupList>
        <li>item</li>
      </GroupList>,
    );
    expect(container.querySelector("ul")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <GroupList>
        <li>First</li>
        <li>Second</li>
      </GroupList>,
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("renders an empty list when given no children", () => {
    const { container } = render(<GroupList>{[]}</GroupList>);
    const ul = container.querySelector("ul");
    expect(ul).toBeInTheDocument();
    expect(ul?.children).toHaveLength(0);
  });
});
