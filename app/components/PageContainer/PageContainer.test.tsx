import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageContainer, PageSection } from "./PageContainer";

describe("PageContainer", () => {
  it("renders children", () => {
    render(
      <PageContainer>
        <p>Page content</p>
      </PageContainer>,
    );
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders a string title as an h1", () => {
    render(
      <PageContainer title="My Page">
        <p>content</p>
      </PageContainer>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "My Page" }),
    ).toBeInTheDocument();
  });

  it("renders a ReactNode title as-is without wrapping in h1", () => {
    render(
      <PageContainer title={<h2 data-testid="custom-title">Custom</h2>}>
        <p>content</p>
      </PageContainer>,
    );
    expect(screen.getByTestId("custom-title")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders no heading when title is omitted", () => {
    render(
      <PageContainer>
        <p>content</p>
      </PageContainer>,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("renders topButtons when provided", () => {
    render(
      <PageContainer topButtons={<button>Top Action</button>}>
        <p>content</p>
      </PageContainer>,
    );
    expect(
      screen.getByRole("button", { name: "Top Action" }),
    ).toBeInTheDocument();
  });

  it("renders bottomButtons when provided", () => {
    render(
      <PageContainer bottomButtons={<button>Bottom Action</button>}>
        <p>content</p>
      </PageContainer>,
    );
    expect(
      screen.getByRole("button", { name: "Bottom Action" }),
    ).toBeInTheDocument();
  });

  it("renders no buttons when topButtons and bottomButtons are omitted", () => {
    render(
      <PageContainer>
        <p>content</p>
      </PageContainer>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("PageSection", () => {
  it("renders children", () => {
    render(
      <PageSection>
        <span>Section content</span>
      </PageSection>,
    );
    expect(screen.getByText("Section content")).toBeInTheDocument();
  });

  it("renders as a div", () => {
    const { container } = render(
      <PageSection>
        <span>content</span>
      </PageSection>,
    );
    expect(container.querySelector("div")).toBeInTheDocument();
  });
});
