import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import FooterPortal from "./FooterPortal";

describe("FooterPortal", () => {
  let portalElement: HTMLElement;

  beforeEach(() => {
    portalElement = document.createElement("div");
    portalElement.id = "footer-portal-element";
    document.body.appendChild(portalElement);
  });

  afterEach(() => {
    const element = document.getElementById("footer-portal-element");
    if (element) {
      document.body.removeChild(element);
    }
  });

  describe("Rendering", () => {
    it("should render children after mounting", () => {
      render(<FooterPortal>Test content</FooterPortal>);
      expect(document.getElementById("footer-portal-element")).toHaveTextContent(
        "Test content",
      );
    });

    it("should not render children in the main container", () => {
      const { container } = render(<FooterPortal>Portal content</FooterPortal>);
      // createPortal renders into #footer-portal-element; the React root container is empty
      expect(container.firstChild).toBeNull();
      expect(container).not.toHaveTextContent("Portal content");
    });

    it("should render complex children", () => {
      render(
        <FooterPortal>
          <div>
            <span>Complex</span>
            <strong>Content</strong>
          </div>
        </FooterPortal>,
      );
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Complex");
      expect(portalContent).toHaveTextContent("Content");
    });

    it("should render multiple children", () => {
      render(
        <FooterPortal>
          <span>First</span>
          <span>Second</span>
          <span>Third</span>
        </FooterPortal>,
      );
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("First");
      expect(portalContent).toHaveTextContent("Second");
      expect(portalContent).toHaveTextContent("Third");
    });
  });

  describe("Portal Target", () => {
    it("should render nothing if portal element does not exist", () => {
      document.body.removeChild(portalElement);
      const { container } = render(<FooterPortal>Test content</FooterPortal>);
      expect(container.firstChild).toBeNull();
    });

    it("should use the correct portal element", () => {
      render(<FooterPortal>Test content</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("Test content");
    });

    it("should not create a new portal element if it doesn't exist", () => {
      document.body.removeChild(portalElement);
      render(<FooterPortal>Test content</FooterPortal>);
      expect(document.getElementById("footer-portal-element")).toBeNull();
    });
  });

  describe("Content", () => {
    it("should render text content", () => {
      render(<FooterPortal>Hello World</FooterPortal>);
      expect(document.getElementById("footer-portal-element")).toHaveTextContent(
        "Hello World",
      );
    });

    it("should render number content", () => {
      render(<FooterPortal>{123}</FooterPortal>);
      expect(document.getElementById("footer-portal-element")).toHaveTextContent(
        "123",
      );
    });

    it("should render null content gracefully", () => {
      render(<FooterPortal>{null}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("");
    });

    it("should render undefined content gracefully", () => {
      render(<FooterPortal>{undefined}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("");
    });

    it("should render empty string content", () => {
      render(<FooterPortal>{""}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("");
      expect(portalContent?.children.length).toBe(0);
    });

    it("should render fragment children", () => {
      render(
        <FooterPortal>
          <>
            <span>Fragment</span>
            <span>Content</span>
          </>
        </FooterPortal>,
      );
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Fragment");
      expect(portalContent).toHaveTextContent("Content");
    });
  });

  describe("Edge Cases", () => {
    it("should work with conditional rendering", () => {
      const { rerender } = render(<FooterPortal>First</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("First");

      rerender(<FooterPortal>Second</FooterPortal>);
      expect(portalContent).toHaveTextContent("Second");
    });

    it("should work with dynamic content", () => {
      const { rerender } = render(<FooterPortal>Initial</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Initial");

      rerender(<FooterPortal>Updated</FooterPortal>);
      expect(portalContent).toHaveTextContent("Updated");
    });

    it("should preserve portal element after unmount", () => {
      const { unmount } = render(<FooterPortal>Test content</FooterPortal>);
      expect(document.getElementById("footer-portal-element")).toBeInTheDocument();

      unmount();
      expect(document.getElementById("footer-portal-element")).toBeInTheDocument();
    });

    it("should clear portal content after unmount", () => {
      const { unmount } = render(<FooterPortal>Test content</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Test content");

      unmount();
      expect(portalContent).not.toHaveTextContent("Test content");
    });
  });

  describe("Integration", () => {
    it("should work with other components", () => {
      const TestComponent = () => (
        <div>
          <span>Parent</span>
          <FooterPortal>Portal content</FooterPortal>
        </div>
      );

      render(<TestComponent />);
      expect(document.getElementById("footer-portal-element")).toHaveTextContent(
        "Portal content",
      );
    });
  });
});
