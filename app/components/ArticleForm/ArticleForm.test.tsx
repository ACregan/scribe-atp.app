import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleForm, type SiteOption } from "./ArticleForm";

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

vi.mock("~/components/Select/Select", () => ({
  Select: ({ name, label, options, multiple, value, onChange }: any) => (
    <div data-testid={`select-${name}`}>
      <label>{label}</label>
      <select
        data-testid={`select-${name}-element`}
        name={name}
        multiple={multiple}
        value={value}
        onChange={(e) => {
          if (multiple) {
            const selectedOptions = Array.from(e.target.selectedOptions).map(
              (opt) => opt.value,
            );
            onChange(selectedOptions);
          } else {
            onChange(e.target.value);
          }
        }}
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
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

vi.mock("~/components/TextArrayInput/TextArrayInput", () => ({
  default: ({ id, label, textArrayItems, setTextArrayItems }: any) => (
    <div data-testid={`text-array-input-${id}`}>
      <label>{label}</label>
      {textArrayItems.map((item: string) => (
        <span key={item} data-testid={`tag-${item}`}>{item}</span>
      ))}
    </div>
  ),
}));

describe("ArticleForm", () => {
  const mockSites: SiteOption[] = [
    { rkey: "site1", title: "Site One", url: "site1.com" },
    { rkey: "site2", title: "Site Two", url: "site2.com" },
  ];

  const mockOnSitesChange = vi.fn();

  beforeEach(() => {
    mockOnSitesChange.mockClear();
  });

  describe("rendering", () => {
    it("should render all form fields", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      expect(screen.getByTestId("input-title")).toBeInTheDocument();
      expect(screen.getByTestId("input-url")).toBeInTheDocument();
      expect(screen.getByTestId("input-splashImageUrl")).toBeInTheDocument();
      expect(screen.getByTestId("select-sites")).toBeInTheDocument();
      expect(screen.getByTestId("editor-content")).toBeInTheDocument();
    });

    it("should render with default values", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
          defaultTitle="Test Title"
          defaultUrl="test-url"
          defaultSplashImageUrl="https://example.com/image.jpg"
          defaultContent="<p>Test content</p>"
        />,
      );

      expect(screen.getByTestId("input-title")).toHaveValue("Test Title");
      expect(screen.getByTestId("input-url")).toHaveValue("test-url");
      expect(screen.getByTestId("input-splashImageUrl")).toHaveValue(
        "https://example.com/image.jpg",
      );
      expect(screen.getByTestId("editor-content-textarea")).toHaveValue(
        "<p>Test content</p>",
      );
    });

    it("should render without default values", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      expect(screen.getByTestId("input-title")).toHaveValue("");
      expect(screen.getByTestId("input-url")).toHaveValue("");
      expect(screen.getByTestId("input-splashImageUrl")).toHaveValue("");
    });

    it("should render with placeholder for URL slug", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      expect(screen.getByTestId("input-url")).toHaveAttribute(
        "placeholder",
        "my-article-title",
      );
    });
  });

  describe("sites multi-select", () => {
    it("should render site options with correct labels", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      const selectElement = screen.getByTestId("select-sites-element");
      const options = selectElement.querySelectorAll("option");

      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent("Site One (site1.com)");
      expect(options[1]).toHaveTextContent("Site Two (site2.com)");
    });

    it("should render as multi-select", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      const selectElement = screen.getByTestId("select-sites-element");
      expect(selectElement).toHaveAttribute("multiple");
    });

    it("should call onSitesChange when selection changes", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      const selectElement = screen.getByTestId("select-sites-element");

      // Select the first option
      fireEvent.change(selectElement, {
        target: { value: "site1" },
      });

      expect(mockOnSitesChange).toHaveBeenCalledWith(["site1"]);
    });

    it("should show selected sites as selected", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={["site1"]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      const selectElement = screen.getByTestId("select-sites-element");
      const option1 = selectElement.querySelector(
        "option[value='site1']",
      ) as HTMLOptionElement | null;
      const option2 = selectElement.querySelector(
        "option[value='site2']",
      ) as HTMLOptionElement | null;

      expect(option1?.selected).toBe(true);
      expect(option2?.selected).toBe(false);
    });

    it("should not render select section when no sites provided", () => {
      render(
        <ArticleForm
          sites={[]}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      expect(screen.queryByTestId("select-sites")).not.toBeInTheDocument();
    });
  });

  describe("error display", () => {
    it("should not render error message when no error", () => {
      const { container } = render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );
      // No styled error paragraph should be present
      expect(container.querySelector("p[style]")).not.toBeInTheDocument();
    });

    it("should render error message when provided", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
          error="This is an error message"
        />,
      );

      const errorElement = screen.getByText("This is an error message");
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveStyle("color: var(--action-danger)");
    });

    it("should render error in a PageSection", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
          error="Test error"
        />,
      );

      const errorElement = screen.getByText("Test error");
      expect(errorElement.closest("section")).toBeInTheDocument();
    });
  });

  describe("form structure", () => {
    it("should wrap inputs in PageSection components", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      const sections = screen.getAllByTestId("page-section");
      // Should have at least 3 sections: inputs, select (if sites exist), editor
      expect(sections.length).toBeGreaterThanOrEqual(3);
    });

    it("should group title/url/splash in one section and editor in a separate section", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      // The three text inputs share a section
      const titleSection = screen
        .getByTestId("input-title")
        .closest("[data-testid='page-section']");
      expect(titleSection).toContainElement(screen.getByTestId("input-url"));
      expect(titleSection).toContainElement(
        screen.getByTestId("input-splashImageUrl"),
      );

      // The editor and select each live in their own distinct sections
      const editorSection = screen
        .getByTestId("editor-content")
        .closest("[data-testid='page-section']");
      const selectSection = screen
        .getByTestId("select-sites")
        .closest("[data-testid='page-section']");

      expect(editorSection).not.toBe(titleSection);
      expect(selectSection).not.toBe(titleSection);
      expect(selectSection).not.toBe(editorSection);
    });
  });

  describe("input labels", () => {
    it("should have correct labels for all inputs", () => {
      render(
        <ArticleForm
          sites={mockSites}
          selectedSites={[]}
          onSitesChange={mockOnSitesChange}
        />,
      );

      expect(screen.getByLabelText("Title")).toBeInTheDocument();
      expect(screen.getByLabelText("URL slug")).toBeInTheDocument();
      expect(screen.getByLabelText("Splash image URL")).toBeInTheDocument();
      expect(screen.getByText("Assign to sites")).toBeInTheDocument();
      expect(screen.getByLabelText("Content")).toBeInTheDocument();
    });
  });
});
