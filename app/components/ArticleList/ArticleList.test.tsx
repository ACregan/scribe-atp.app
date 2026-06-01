import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ArticleList from "./ArticleList";

describe("ArticleList", () => {
  it("should render as an unordered list", () => {
    render(<ArticleList>Test content</ArticleList>);
    const list = screen.getByRole("list");
    expect(list).toBeInTheDocument();
    expect(list.tagName).toBe("UL");
  });

  it("should render children inside the list", () => {
    render(
      <ArticleList>
        <li>Item 1</li>
        <li>Item 2</li>
      </ArticleList>,
    );
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("should render with empty children", () => {
    const { container } = render(<ArticleList>{null}</ArticleList>);
    const list = container.querySelector("ul");
    expect(list).toBeInTheDocument();
    expect(list?.children.length).toBe(0);
  });

  it("should apply the articleList CSS class", () => {
    const { container } = render(<ArticleList>Content</ArticleList>);
    const list = container.querySelector("ul");
    // The class will be mangled by CSS modules, but it should exist
    expect(list?.className).toBeTruthy();
  });
});
