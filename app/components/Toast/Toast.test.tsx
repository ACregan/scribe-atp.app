import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Toast, ToastContainer, Toasts } from "./Toast";
import type { ToastPropsWithId } from "./ToastContext";

vi.mock("../SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => <svg data-icon={name} />,
  SvgImageList: { Close: "Close" },
}));

// useToast is only needed by Toasts — mock it for those tests
const mockToasts: ToastPropsWithId[] = [];
const mockRemoveToast = vi.fn();

vi.mock("~/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("./ToastContext", () => ({
  useToast: () => ({
    toasts: mockToasts,
    removeToast: mockRemoveToast,
  }),
}));

const baseProps: ToastPropsWithId = {
  id: "toast-1",
  heading: "Success",
  removeToast: vi.fn(),
};

describe("Toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the heading", () => {
    render(<Toast {...baseProps} />);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("renders content when provided", () => {
    render(<Toast {...baseProps} content="Article saved" />);
    expect(screen.getByText("Article saved")).toBeInTheDocument();
  });

  it("renders no content section when content is omitted", () => {
    const { container } = render(<Toast {...baseProps} />);
    // Only the header container div should be present, no toastContent div
    expect(
      container.querySelector("[class*='toastContent']"),
    ).not.toBeInTheDocument();
  });

  it("calls removeToast with the id when the close button is clicked", () => {
    const removeToast = vi.fn();
    const { container } = render(
      <Toast {...baseProps} removeToast={removeToast} />,
    );
    fireEvent.click(screen.getByRole("button"));
    // removeToast fires after the slide-out CSS transition completes
    fireEvent.transitionEnd(container.firstElementChild!);
    expect(removeToast).toHaveBeenCalledWith("toast-1");
  });

  it("auto-removes after expireTimeSeconds when autoExpire is true", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const removeToast = vi.fn();
    const { container } = render(
      <Toast
        {...baseProps}
        removeToast={removeToast}
        autoExpire
        expireTimeSeconds={3}
      />,
    );
    expect(removeToast).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // removeToast fires after the slide-out CSS transition completes
    fireEvent.transitionEnd(container.firstElementChild!);
    expect(removeToast).toHaveBeenCalledWith("toast-1");
    vi.useRealTimers();
  });

  it("does not auto-remove when autoExpire is false", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const removeToast = vi.fn();
    render(
      <Toast {...baseProps} removeToast={removeToast} autoExpire={false} />,
    );
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(removeToast).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("applies the primary variant class by default", () => {
    const { container } = render(<Toast {...baseProps} />);
    expect(container.firstElementChild?.className).toContain("primaryVariant");
  });

  it("applies the danger variant class when variant='danger'", () => {
    const { container } = render(<Toast {...baseProps} variant="danger" />);
    expect(container.firstElementChild?.className).toContain("dangerVariant");
  });

  it("applies the secondary variant class when variant='secondary'", () => {
    const { container } = render(<Toast {...baseProps} variant="secondary" />);
    expect(container.firstElementChild?.className).toContain(
      "secondaryVariant",
    );
  });
});

describe("ToastContainer", () => {
  it("renders children inside a div", () => {
    const { container } = render(
      <ToastContainer>
        <span>child</span>
      </ToastContainer>,
    );
    expect(container.querySelector("div")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});

describe("Toasts", () => {
  it("renders an empty container when there are no toasts", () => {
    mockToasts.length = 0;
    const { container } = render(<Toasts />);
    // ToastContainer always renders its wrapper div; verify it has no toast children.
    expect(container.firstElementChild?.children).toHaveLength(0);
  });
});
