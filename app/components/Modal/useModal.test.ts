import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useModal } from "./useModal";

describe("useModal", () => {
  it("starts closed by default", () => {
    const { result } = renderHook(() => useModal());
    expect(result.current.isOpen).toBe(false);
  });

  it("starts open when initialOpen is true", () => {
    const { result } = renderHook(() => useModal(true));
    expect(result.current.isOpen).toBe(true);
  });

  it("open() sets isOpen to true", () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
  });

  it("close() sets isOpen to false", () => {
    const { result } = renderHook(() => useModal(true));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it("open and close are stable references across re-renders", () => {
    const { result, rerender } = renderHook(() => useModal());
    const { open, close } = result.current;
    rerender();
    expect(result.current.open).toBe(open);
    expect(result.current.close).toBe(close);
  });
});
