import React from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ToastProvider, useToast } from "./ToastContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
  it("throws when called outside a ToastProvider", () => {
    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within a ToastProvider",
    );
  });
});

describe("ToastProvider", () => {
  it("provides an empty toasts array initially", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("addToast appends a toast with a generated id", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast({ heading: "Hello" }));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].heading).toBe("Hello");
    expect(result.current.toasts[0].id).toBeDefined();
    expect(typeof result.current.toasts[0].id).toBe("string");
  });

  it("addToast preserves all supplied props", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() =>
      result.current.addToast({
        heading: "Saved",
        content: "Article updated",
        variant: "primary",
        autoExpire: false,
        expireTimeSeconds: 10,
      }),
    );
    const toast = result.current.toasts[0];
    expect(toast.content).toBe("Article updated");
    expect(toast.variant).toBe("primary");
    expect(toast.autoExpire).toBe(false);
    expect(toast.expireTimeSeconds).toBe(10);
  });

  it("removeToast removes the matching toast by id", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast({ heading: "First" }));
    const id = result.current.toasts[0].id;
    act(() => result.current.removeToast(id));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("removeToast only removes the targeted toast when multiple exist", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.addToast({ heading: "First" });
      result.current.addToast({ heading: "Second" });
    });
    expect(result.current.toasts).toHaveLength(2);
    const firstId = result.current.toasts[0].id;
    act(() => result.current.removeToast(firstId));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].heading).toBe("Second");
  });

  it("removeToast is a stable reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useToast(), { wrapper });
    const removeToast = result.current.removeToast;
    rerender();
    expect(result.current.removeToast).toBe(removeToast);
  });
});
