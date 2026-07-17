import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnsavedChangesModal } from "./UnsavedChangesModal";

describe("UnsavedChangesModal", () => {
  it("calls onStay when Stay is clicked", () => {
    const onStay = vi.fn();
    render(
      <UnsavedChangesModal
        isOpen
        isSaving={false}
        onStay={onStay}
        onDiscard={vi.fn()}
        onSaveAndLeave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(onStay).toHaveBeenCalled();
  });

  it("calls onDiscard when Discard & Leave is clicked", () => {
    const onDiscard = vi.fn();
    render(
      <UnsavedChangesModal
        isOpen
        isSaving={false}
        onStay={vi.fn()}
        onDiscard={onDiscard}
        onSaveAndLeave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard & Leave" }));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("calls onSaveAndLeave when Save & Leave is clicked", () => {
    const onSaveAndLeave = vi.fn();
    render(
      <UnsavedChangesModal
        isOpen
        isSaving={false}
        onStay={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndLeave={onSaveAndLeave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save & Leave" }));
    expect(onSaveAndLeave).toHaveBeenCalled();
  });

  it("shows a pending label and disables Save & Leave while isSaving", () => {
    render(
      <UnsavedChangesModal
        isOpen
        isSaving
        onStay={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndLeave={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
