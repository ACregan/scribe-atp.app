import React, { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Modal } from "./Modal";

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  title: "Test Modal",
  children: <p>Modal body</p>,
};

describe("Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("visibility", () => {
    it("renders nothing when isOpen is false", () => {
      render(<Modal {...defaultProps} isOpen={false} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders the dialog when isOpen is true", () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("content", () => {
    it("renders the title", () => {
      render(<Modal {...defaultProps} title="My Title" />);
      expect(screen.getByText("My Title")).toBeInTheDocument();
    });

    it("renders children", () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByText("Modal body")).toBeInTheDocument();
    });

    it("renders footer when provided", () => {
      render(<Modal {...defaultProps} footer={<button>Confirm</button>} />);
      expect(
        screen.getByRole("button", { name: "Confirm" }),
      ).toBeInTheDocument();
    });

    it("renders no footer section when footer is omitted", () => {
      render(<Modal {...defaultProps} />);
      // close button is the only button
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAttribute("aria-label", "Close modal");
    });
  });

  describe("closing", () => {
    it("calls onClose when the close button is clicked", () => {
      render(<Modal {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: /close modal/i }));
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when the overlay is clicked", () => {
      render(<Modal {...defaultProps} />);
      fireEvent.click(screen.getByRole("dialog"));
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when the modal content itself is clicked", () => {
      render(<Modal {...defaultProps} />);
      fireEvent.click(screen.getByText("Modal body"));
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it("calls onClose when Escape key is pressed", () => {
      render(<Modal {...defaultProps} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose on other key presses", () => {
      render(<Modal {...defaultProps} />);
      fireEvent.keyDown(document, { key: "Enter" });
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it("removes the Escape key listener when closed", () => {
      const { rerender } = render(<Modal {...defaultProps} />);
      rerender(<Modal {...defaultProps} isOpen={false} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe("dialog element", () => {
    it("renders a native dialog element", () => {
      render(<Modal {...defaultProps} />);
      expect(document.querySelector("dialog")).toBeInTheDocument();
    });

    it("dialog element is accessible with role dialog when open", () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("exposes the dialog element via a forwarded ref", () => {
      const ref = createRef<HTMLDialogElement>();
      render(<Modal {...defaultProps} ref={ref} />);
      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName.toLowerCase()).toBe("dialog");
    });
  });

  describe("fullscreen guard", () => {
    afterEach(() => {
      // Restore fullscreenElement to null after each test in this group
      Object.defineProperty(document, "fullscreenElement", {
        get: () => null,
        configurable: true,
      });
    });

    it("does not call onClose on Escape while the browser is in fullscreen", () => {
      Object.defineProperty(document, "fullscreenElement", {
        get: () => document.body,
        configurable: true,
      });
      render(<Modal {...defaultProps} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it("calls onClose on Escape when fullscreenElement is null", () => {
      render(<Modal {...defaultProps} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });
});
