import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArticleForm } from "./ArticleForm";

// Mock child components to simplify testing
vi.mock("~/components/Input/Input", () => ({
  Input: ({ name, label, defaultValue, placeholder }: any) => (
    <input
      data-testid={`input-${name}`}
      name={name}
      aria-label={label}
      defaultValue={defaultValue}
      placeholder={placeholder}
    />
  ),
}));

vi.mock("~/components/RichTextEditor/RichTextEditor", () => ({
  RichTextEditor: ({ name, label, defaultValue }: any) => (
    <div data-testid={`editor-${name}`}>
      <label htmlFor={`editor-${name}-textarea`}>{label}</label>
      <textarea
        id={`editor-${name}-textarea`}
        data-testid={`editor-${name}-textarea`}
        name={name}
        defaultValue={defaultValue}
      />
    </div>
  ),
}));

vi.mock("~/components/PageContainer/PageContainer", () => ({
  PageSection: ({ children }: any) => (
    <section data-testid="page-section">{children}</section>
  ),
}));

vi.mock("~/components/ImagePicker/ImagePicker", () => ({
  ImagePicker: ({ name, label, defaultValue }: any) => (
    <div data-testid={`image-picker-${name}`}>
      <span>{label}</span>
      <input
        type="hidden"
        name={name}
        value={defaultValue ?? ""}
        data-testid={`image-picker-input-${name}`}
        readOnly
      />
    </div>
  ),
}));

vi.mock("~/components/ArticleContributors/ArticleContributors", () => ({
  default: ({ contributors }: any) => (
    <div data-testid="article-contributors">
      {contributors.map((c: any) => (
        <span key={c.did}>{c.displayName}</span>
      ))}
    </div>
  ),
}));

vi.mock("~/components/TextArrayInput/TextArrayInput", () => ({
  default: ({ id, label, textArrayItems }: any) => (
    <div data-testid={`text-array-input-${id}`}>
      <label>{label}</label>
      {textArrayItems.map((item: string) => (
        <span key={item} data-testid={`tag-${item}`}>{item}</span>
      ))}
    </div>
  ),
}));

describe("ArticleForm", () => {
  describe("rendering", () => {
    it("should render all form fields", () => {
      render(<ArticleForm />);

      expect(screen.getByTestId("input-title")).toBeInTheDocument();
      expect(screen.getByTestId("input-url")).toBeInTheDocument();
      expect(screen.getByTestId("image-picker-splashImageUrl")).toBeInTheDocument();
      expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    });

    it("should render with default values", () => {
      render(
        <ArticleForm
          defaultTitle="Test Title"
          defaultUrl="test-url"
          defaultSplashImageUrl="https://example.com/image.jpg"
          defaultContent="<p>Test content</p>"
        />,
      );

      expect(screen.getByTestId("input-title")).toHaveValue("Test Title");
      expect(screen.getByTestId("input-url")).toHaveValue("test-url");
      expect(screen.getByTestId("image-picker-input-splashImageUrl")).toHaveValue(
        "https://example.com/image.jpg",
      );
      expect(screen.getByTestId("editor-content-textarea")).toHaveValue(
        "<p>Test content</p>",
      );
    });

    it("should render without default values", () => {
      render(<ArticleForm />);

      expect(screen.getByTestId("input-title")).toHaveValue("");
      expect(screen.getByTestId("input-url")).toHaveValue("");
      expect(screen.getByTestId("image-picker-input-splashImageUrl")).toHaveValue("");
    });

    it("should render with placeholder for URL slug", () => {
      render(<ArticleForm />);

      expect(screen.getByTestId("input-url")).toHaveAttribute(
        "placeholder",
        "my-article-title",
      );
    });

    it("should not render any site-assignment UI — that's exclusively the Publish action's job (ADR 0013)", () => {
      render(<ArticleForm />);

      expect(screen.queryByText("Assign to sites")).not.toBeInTheDocument();
    });
  });

  describe("error display", () => {
    it("should not render error message when no error", () => {
      const { container } = render(<ArticleForm />);
      // No error paragraph should be present
      expect(container.querySelector("p[style*='action-danger']")).not.toBeInTheDocument();
    });

    it("should render error message when provided", () => {
      render(<ArticleForm error="This is an error message" />);

      const errorElement = screen.getByText("This is an error message");
      expect(errorElement).toBeInTheDocument();
    });

    it("should render error in a PageSection", () => {
      render(<ArticleForm error="Test error" />);

      const errorElement = screen.getByText("Test error");
      expect(errorElement.closest("section")).toBeInTheDocument();
    });
  });

  describe("form structure", () => {
    it("should wrap inputs in PageSection components", () => {
      render(<ArticleForm />);

      const sections = screen.getAllByTestId("page-section");
      // Should have at least 2 sections: inputs, editor
      expect(sections.length).toBeGreaterThanOrEqual(2);
    });

    it("should group title/url/splash in one section and editor in a separate section", () => {
      render(<ArticleForm />);

      // The three text inputs share a section
      const titleSection = screen
        .getByTestId("input-title")
        .closest("[data-testid='page-section']");
      expect(titleSection).toContainElement(screen.getByTestId("input-url"));
      expect(titleSection).toContainElement(
        screen.getByTestId("image-picker-splashImageUrl"),
      );

      // The editor lives in its own distinct section
      const editorSection = screen
        .getByTestId("editor-content")
        .closest("[data-testid='page-section']");

      expect(editorSection).not.toBe(titleSection);
    });
  });

  describe("input labels", () => {
    it("should have correct labels for all inputs", () => {
      render(<ArticleForm />);

      expect(screen.getByLabelText("Title")).toBeInTheDocument();
      expect(screen.getByLabelText("URL slug")).toBeInTheDocument();
      expect(screen.getByText("Splash image")).toBeInTheDocument();
      expect(screen.getByLabelText("Content")).toBeInTheDocument();
    });
  });
});
