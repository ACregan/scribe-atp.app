import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ImagesRoute from "./images";

// ── react-router ────────────────────────────────────────────────────────────
const revalidateMock = vi.fn();
const revalidatorStateMock = vi.hoisted(() => ({ state: "idle" as string }));

vi.mock("react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRevalidator: () => ({
    revalidate: revalidateMock,
    state: revalidatorStateMock.state,
  }),
}));

// ── dnd-kit ──────────────────────────────────────────────────────────────────
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: () => null,
  PointerSensor: class {},
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

// ── modal sub-components ─────────────────────────────────────────────────────
vi.mock("./UploadModal", () => ({ UploadModal: () => null }));
vi.mock("./NewFolderModal", () => ({ NewFolderModal: () => null }));
vi.mock("./MoveImageModal", () => ({ MoveImageModal: () => null }));
vi.mock("./DeleteImageModal", () => ({ DeleteImageModal: () => null }));
vi.mock("./ImagePreviewModal", () => ({ ImagePreviewModal: () => null }));
vi.mock("./BulkDeleteModal", () => ({ BulkDeleteModal: () => null }));
vi.mock("./BulkMoveModal", () => ({ BulkMoveModal: () => null }));
vi.mock("./AddToNewFolderModal", () => ({ AddToNewFolderModal: () => null }));

// ── server services ───────────────────────────────────────────────────────────
vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(),
  useRealOAuth: false,
}));

// ── client services ───────────────────────────────────────────────────────────
vi.mock("~/services/imageServiceClient", () => ({
  bulkMove: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock("~/components/Toast/ToastContext", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("~/components/Modal/useModal", () => ({
  useModal: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

// ── UI components ─────────────────────────────────────────────────────────────
vi.mock("~/components/Button/Button", () => ({
  Button: ({
    children,
    type,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode;
    type?: string;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button
      type={type as "button"}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

vi.mock("~/components/Spinner/Spinner", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

vi.mock("~/components/PageContainer/PageContainer", () => ({
  PageContainer: ({
    children,
    title,
    topButtons,
  }: {
    children: React.ReactNode;
    title?: React.ReactNode;
    topButtons?: React.ReactNode;
  }) => (
    <div>
      {title}
      {topButtons}
      {children}
    </div>
  ),
  PageContainerHeading: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
  PageSection: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("~/components/SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => (
    <svg data-testid="svg-icon" data-icon={name} />
  ),
  SvgImageList: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_LOADER_DATA = {
  currentUserDid: "did:plc:testuser",
  folder: null,
  breadcrumbs: [],
  subfolders: [],
  images: [],
  profiles: {},
};

function renderRoute(
  loaderData: typeof BASE_LOADER_DATA & { serviceError?: boolean },
) {
  // ImagesRoute expects Route.ComponentProps — at runtime this is just { loaderData }
  return render(<ImagesRoute loaderData={loaderData as never} />);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("ImagesRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revalidatorStateMock.state = "idle";
  });

  describe("service error state", () => {
    it("shows the unavailable message when serviceError is true", () => {
      renderRoute({ ...BASE_LOADER_DATA, serviceError: true });
      expect(screen.getByText("Image Service unavailable")).toBeInTheDocument();
      expect(screen.getByText(/did not respond in time/i)).toBeInTheDocument();
    });

    it("shows a Retry button when serviceError is true", () => {
      renderRoute({ ...BASE_LOADER_DATA, serviceError: true });
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("calls revalidate when Retry is clicked", () => {
      renderRoute({ ...BASE_LOADER_DATA, serviceError: true });
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(revalidateMock).toHaveBeenCalledTimes(1);
    });

    it("disables the Retry button and shows Retrying… while revalidating", () => {
      revalidatorStateMock.state = "loading";
      renderRoute({ ...BASE_LOADER_DATA, serviceError: true });
      const btn = screen.getByRole("button", { name: "Retrying…" });
      expect(btn).toBeDisabled();
    });

    it("does not show the empty-library message when serviceError is true", () => {
      renderRoute({ ...BASE_LOADER_DATA, serviceError: true });
      expect(screen.queryByText("No images yet")).not.toBeInTheDocument();
    });
  });

  describe("normal empty state", () => {
    it("shows No images yet when there are no images and no service error", () => {
      renderRoute(BASE_LOADER_DATA);
      expect(screen.getByText("No images yet")).toBeInTheDocument();
    });

    it("does not show the service error message in the normal empty state", () => {
      renderRoute(BASE_LOADER_DATA);
      expect(
        screen.queryByText("Image Service unavailable"),
      ).not.toBeInTheDocument();
    });
  });
});
