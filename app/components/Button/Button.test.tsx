import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  describe("Rendering", () => {
    it("should render a button element", () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should render button with text content", () => {
      render(<Button>Submit</Button>);
      expect(
        screen.getByRole("button", { name: /submit/i }),
      ).toBeInTheDocument();
    });

    it("should render button with children", () => {
      render(
        <Button>
          <span>Custom content</span>
        </Button>,
      );
      expect(screen.getByText("Custom content")).toBeInTheDocument();
    });

    it("should render button with multiple children", () => {
      render(
        <Button>
          <span>Icon</span>
          <span>Label</span>
        </Button>,
      );
      expect(screen.getByText("Icon")).toBeInTheDocument();
      expect(screen.getByText("Label")).toBeInTheDocument();
    });
  });

  describe("Variants", () => {
    it("should apply primary variant class by default", () => {
      const { container } = render(<Button>Primary</Button>);
      const button = container.querySelector("button");
      expect(button?.className).toContain("button");
      expect(button?.className).toContain("primary");
    });

    it("should apply primary variant class when specified", () => {
      const { container } = render(<Button variant="primary">Primary</Button>);
      const button = container.querySelector("button");
      expect(button?.className).toContain("button");
      expect(button?.className).toContain("primary");
    });

    it("should apply secondary variant class when specified", () => {
      const { container } = render(
        <Button variant="secondary">Secondary</Button>,
      );
      const button = container.querySelector("button");
      expect(button?.className).toContain("button");
      expect(button?.className).toContain("secondary");
    });

    it("should apply danger variant class when specified", () => {
      const { container } = render(<Button variant="danger">Danger</Button>);
      const button = container.querySelector("button");
      expect(button?.className).toContain("button");
      expect(button?.className).toContain("danger");
    });

    it("should have different classes for different variants", () => {
      const { container: primaryContainer } = render(
        <Button variant="primary">Primary</Button>,
      );
      const { container: secondaryContainer } = render(
        <Button variant="secondary">Secondary</Button>,
      );
      const { container: dangerContainer } = render(
        <Button variant="danger">Danger</Button>,
      );

      const primaryButton = primaryContainer.querySelector("button");
      const secondaryButton = secondaryContainer.querySelector("button");
      const dangerButton = dangerContainer.querySelector("button");

      expect(primaryButton?.className).not.toBe(secondaryButton?.className);
      expect(secondaryButton?.className).not.toBe(dangerButton?.className);
      expect(primaryButton?.className).not.toBe(dangerButton?.className);
    });
  });

  describe("Custom ClassName", () => {
    it("should apply custom className", () => {
      const { container } = render(
        <Button className="custom-class">Button</Button>,
      );
      const button = container.querySelector("button");
      expect(button).toHaveClass("custom-class");
    });

    it("should apply custom className along with default classes", () => {
      const { container } = render(
        <Button className="my-custom-class">Button</Button>,
      );
      const button = container.querySelector("button");
      expect(button?.className).toContain("my-custom-class");
      expect(button?.className).toMatch(/button/);
    });

    it("should handle multiple custom classes", () => {
      const { container } = render(
        <Button className="class1 class2 class3">Button</Button>,
      );
      const button = container.querySelector("button");
      expect(button).toHaveClass("class1");
      expect(button).toHaveClass("class2");
      expect(button).toHaveClass("class3");
    });
  });

  describe("HTML Attributes", () => {
    it("should pass through HTML button attributes", () => {
      render(<Button type="submit">Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "submit");
    });

    it("should support disabled attribute", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should support name attribute", () => {
      render(<Button name="myButton">Named Button</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("name", "myButton");
    });

    it("should support id attribute", () => {
      render(<Button id="myButtonId">Button with ID</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("id", "myButtonId");
    });

    it("should support aria-label attribute", () => {
      render(<Button aria-label="Close dialog">X</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "Close dialog",
      );
    });

    it("should support aria-describedby attribute", () => {
      render(<Button aria-describedby="help-text">Help</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-describedby",
        "help-text",
      );
    });

    it("should support data attributes", () => {
      render(
        <Button data-testid="test-button" data-custom="value">
          Button
        </Button>,
      );
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("data-testid", "test-button");
      expect(button).toHaveAttribute("data-custom", "value");
    });

    it("should support title attribute", () => {
      render(<Button title="Click to submit">Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "title",
        "Click to submit",
      );
    });

    it("should support tabIndex attribute", () => {
      render(<Button tabIndex={0}>Tabbable</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("tabIndex", "0");
    });
  });

  describe("Interactions", () => {
    it("should be clickable", () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(button).toBeInTheDocument();
    });

    it("should call onClick handler when clicked", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should pass event to onClick handler", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledWith(
        expect.objectContaining({ type: "click" }),
      );
    });

    it("should not be clickable when disabled", () => {
      const handleClick = vi.fn();
      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>,
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should call onMouseEnter handler", () => {
      const handleMouseEnter = vi.fn();
      render(<Button onMouseEnter={handleMouseEnter}>Hover me</Button>);
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(handleMouseEnter).toHaveBeenCalledTimes(1);
    });

    it("should call onMouseLeave handler", () => {
      const handleMouseLeave = vi.fn();
      render(<Button onMouseLeave={handleMouseLeave}>Hover me</Button>);
      const button = screen.getByRole("button");
      fireEvent.mouseLeave(button);
      expect(handleMouseLeave).toHaveBeenCalledTimes(1);
    });

    it("should call onFocus handler", () => {
      const handleFocus = vi.fn();
      render(<Button onFocus={handleFocus}>Focus me</Button>);
      const button = screen.getByRole("button");
      fireEvent.focus(button);
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it("should call onBlur handler", () => {
      const handleBlur = vi.fn();
      render(<Button onBlur={handleBlur}>Blur me</Button>);
      const button = screen.getByRole("button");
      fireEvent.blur(button);
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("should be focusable by default", () => {
      render(<Button>Focusable</Button>);
      const button = screen.getByRole("button");
      expect(button).not.toHaveAttribute("tabIndex", "-1");
    });

    it("should not be focusable when disabled", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should have proper button role", () => {
      render(<Button>Button</Button>);
      const button = screen.getByRole("button");
      expect(button.tagName).toBe("BUTTON");
    });

    it("should be accessible with screen reader", () => {
      render(<Button aria-label="Submit form">Submit</Button>);
      const button = screen.getByRole("button", { name: "Submit form" });
      expect(button).toBeInTheDocument();
    });
  });

  describe("Form Integration", () => {
    it("should work as a submit button in a form", () => {
      const handleSubmit = vi.fn((e) => e.preventDefault());
      render(
        <form onSubmit={handleSubmit}>
          <Button type="submit">Submit</Button>
        </form>,
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    it("should work as a reset button in a form", () => {
      const handleReset = vi.fn();
      render(
        <form onReset={handleReset}>
          <input type="text" defaultValue="test" />
          <Button type="reset">Reset</Button>
        </form>,
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });

    it("should have no type attribute when type prop is omitted", () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole("button");
      expect(button).not.toHaveAttribute("type");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty children", () => {
      const { container } = render(<Button />);
      const button = container.querySelector("button");
      expect(button).toBeInTheDocument();
      expect(button?.children.length).toBe(0);
    });

    it("should handle null children", () => {
      const { container } = render(<Button>{null}</Button>);
      const button = container.querySelector("button");
      expect(button).toBeInTheDocument();
    });

    it("should handle undefined children", () => {
      const { container } = render(<Button>{undefined}</Button>);
      const button = container.querySelector("button");
      expect(button).toBeInTheDocument();
    });

    it("should handle empty string children", () => {
      const { container } = render(<Button>{""}</Button>);
      const button = container.querySelector("button");
      expect(button).toBeInTheDocument();
    });

    it("should handle complex children", () => {
      render(
        <Button>
          <div>
            <span>Complex</span>
            <strong>Content</strong>
          </div>
        </Button>,
      );
      expect(screen.getByText("Complex")).toBeInTheDocument();
      expect(screen.getByText("Content")).toBeInTheDocument();
    });
  });
});
