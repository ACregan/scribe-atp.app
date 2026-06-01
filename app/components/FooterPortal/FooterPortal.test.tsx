import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import FooterPortal from "./FooterPortal";

describe("FooterPortal", () => {
  let portalElement: HTMLElement;

  beforeEach(() => {
    // Create the portal target element
    portalElement = document.createElement("div");
    portalElement.id = "footer-portal-element";
    document.body.appendChild(portalElement);
  });

  afterEach(() => {
    // Clean up the portal element
    const element = document.getElementById("footer-portal-element");
    if (element) {
      document.body.removeChild(element);
    }
  });

  describe("Rendering", () => {
    it("should render null on initial mount", () => {
      const { container } = render(<FooterPortal>Test content</FooterPortal>);
      // On initial mount, before useEffect runs, it should render null
      expect(container.firstChild).toBeNull();
    });

    it("should render children after mounting", async () => {
      render(<FooterPortal>Test content</FooterPortal>);
      // After mounting, the content should be in the portal element
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Test content");
    });

    it("should render children into the portal element", async () => {
      render(<FooterPortal>Portal content</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("Portal content");
    });

    it("should not render children in the main container", async () => {
      const { container } = render(<FooterPortal>Portal content</FooterPortal>);
      // The content should NOT be in the main container
      expect(container).not.toHaveTextContent("Portal content");
    });

    it("should render complex children", async () => {
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

    it("should render multiple children", async () => {
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
      // Remove the portal element
      document.body.removeChild(portalElement);
      const { container } = render(<FooterPortal>Test content</FooterPortal>);
      expect(container.firstChild).toBeNull();
    });

    it("should use the correct portal element", async () => {
      render(<FooterPortal>Test content</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("Test content");
    });

    it("should not create a new portal element if it doesn't exist", () => {
      // Remove the portal element
      document.body.removeChild(portalElement);
      render(<FooterPortal>Test content</FooterPortal>);
      // Should not have created a new element
      expect(document.getElementById("footer-portal-element")).toBeNull();
    });
  });

  describe("Content", () => {
    it("should render text content", async () => {
      render(<FooterPortal>Hello World</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Hello World");
    });

    it("should render number content", async () => {
      render(<FooterPortal>{123}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("123");
    });

    it("should render null content gracefully", async () => {
      render(<FooterPortal>{null}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      // Should render but be empty
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("");
    });

    it("should render undefined content gracefully", async () => {
      render(<FooterPortal>{undefined}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      // Should render but be empty
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("");
    });

    it("should render empty string content", async () => {
      render(<FooterPortal>{""}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent).toHaveTextContent("");
    });

    it("should render fragment children", async () => {
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
    it("should handle empty string children", async () => {
      render(<FooterPortal>{""}</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();
      expect(portalContent?.children.length).toBe(0);
    });

    it("should handle portal element being removed after mount", async () => {
      render(<FooterPortal>Test content</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Test content");

      // Remove the portal element
      document.body.removeChild(portalElement);
      // The content should still be in the DOM (in the removed element)
      expect(portalContent).toHaveTextContent("Test content");
    });

    it("should work with conditional rendering", async () => {
      const { rerender } = render(<FooterPortal>First</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("First");

      rerender(<FooterPortal>Second</FooterPortal>);
      expect(portalContent).toHaveTextContent("Second");
    });

    it("should work with dynamic content", async () => {
      const { rerender } = render(<FooterPortal>Initial</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Initial");

      rerender(<FooterPortal>Updated</FooterPortal>);
      expect(portalContent).toHaveTextContent("Updated");
    });

    it("should preserve portal element after unmount", async () => {
      const { unmount } = render(<FooterPortal>Test content</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toBeInTheDocument();

      unmount();
      // Portal element should still exist in the DOM
      expect(
        document.getElementById("footer-portal-element"),
      ).toBeInTheDocument();
    });

    it("should clear portal content after unmount", async () => {
      const { unmount } = render(<FooterPortal>Test content</FooterPortal>);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Test content");

      unmount();
      // Portal content should be removed
      expect(portalContent).not.toHaveTextContent("Test content");
    });
  });

  describe("Integration", () => {
    it("should work with other components", async () => {
      const TestComponent = () => (
        <div>
          <span>Parent</span>
          <FooterPortal>Portal content</FooterPortal>
        </div>
      );

      render(<TestComponent />);
      const portalContent = document.getElementById("footer-portal-element");
      expect(portalContent).toHaveTextContent("Portal content");
    });

    it("should work with nested portals", async () => {
      render(
        <FooterPortal>
          <FooterPortal>Nested content</FooterPortal>
        </FooterPortal>,
      );
      const portalContent = document.getElementById("footer-portal-element");
      // The nested portal would also render to the same element
      expect(portalContent).toHaveTextContent("Nested content");
    });
  });
});
