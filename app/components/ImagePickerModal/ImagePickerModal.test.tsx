import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImagePickerModal } from "./ImagePickerModal";
import type { BrowseResponse } from "./imageBrowserTypes";

// ─── Mock imageServiceClient ──────────────────────────────────────────────────

const mockBrowseFolders =
  vi.fn<(folderId?: number) => Promise<BrowseResponse>>();

vi.mock("~/services/imageServiceClient", () => ({
  browseFolders: (folderId?: number) => mockBrowseFolders(folderId),
}));

// ─── Mock child components ────────────────────────────────────────────────────

vi.mock("~/components/Modal/Modal", () => ({
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

vi.mock("~/components/Spinner/Spinner", () => ({
  Spinner: ({ size }: { size?: string }) => (
    <span data-testid="spinner" data-size={size} />
  ),
}));

vi.mock("~/components/Button/Button", () => ({
  Button: ({
    children,
    onClick,
    type,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
    variant?: string;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("~/components/SvgIcon/SvgIcon", () => ({
  default: ({ name }: { name: string }) => (
    <svg data-testid="svg-icon" data-icon={name} />
  ),
  SvgImageList: { Folder: "folder" },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const IMAGE_1 = {
  id: 1,
  user_did: "did:test:user",
  filename: "abc123",
  original_name: "photo.jpg",
  width: 1200,
  height: 800,
  sizes: {
    thumb: { width: 300, height: 200, bytes: 5000 },
    "1200": { width: 1200, height: 800, bytes: 85000 },
    max: { width: 1200, height: 800, bytes: 95000 },
  },
  created_at: "2025-01-01T00:00:00Z",
};

const IMAGE_THUMB_ONLY = {
  id: 2,
  user_did: "did:test:user",
  filename: "def456",
  original_name: "small.jpg",
  width: 200,
  height: 150,
  sizes: { thumb: { width: 200, height: 150, bytes: 2000 } },
  created_at: "2025-01-02T00:00:00Z",
};

const SUBFOLDER = {
  id: 10,
  user_did: "did:test:user",
  name: "My Subfolder",
  parent_id: null,
};

const ROOT_RESPONSE: BrowseResponse = {
  folder: null,
  breadcrumbs: [],
  subfolders: [SUBFOLDER],
  images: [IMAGE_1],
};

const SUBFOLDER_RESPONSE: BrowseResponse = {
  folder: {
    id: 10,
    user_did: "did:test:user",
    name: "My Subfolder",
    parent_id: null,
  },
  breadcrumbs: [{ id: 10, name: "My Subfolder" }],
  subfolders: [],
  images: [IMAGE_THUMB_ONLY],
};

const EMPTY_RESPONSE: BrowseResponse = {
  folder: null,
  breadcrumbs: [],
  subfolders: [],
  images: [],
};

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  onPick: vi.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ImagePickerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowseFolders.mockResolvedValue(ROOT_RESPONSE);
  });

  describe("loading and rendering", () => {
    it("shows a spinner while data is loading", () => {
      mockBrowseFolders.mockReturnValue(new Promise(() => {}));
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      expect(screen.getByTestId("spinner")).toBeInTheDocument();
    });

    it("renders folder tiles and image tiles after loading", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("My Subfolder")).toBeInTheDocument(),
      );
      expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    });

    it("renders the Thumb button for images that have a thumb variant", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("photo.jpg")).toBeInTheDocument(),
      );
      expect(screen.getByTitle("Insert Thumb")).toBeInTheDocument();
    });

    it("renders the split button main with the largest non-thumb variant", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByTitle("Insert Max")).toBeInTheDocument(),
      );
    });

    it("shows empty state when the folder has no items", async () => {
      mockBrowseFolders.mockResolvedValue(EMPTY_RESPONSE);
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("This folder is empty.")).toBeInTheDocument(),
      );
    });

    it("renders nothing when isOpen is false", () => {
      mockBrowseFolders.mockResolvedValue(ROOT_RESPONSE);
      render(<ImagePickerModal {...DEFAULT_PROPS} isOpen={false} />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message and Retry button when browseFolders rejects", async () => {
      mockBrowseFolders.mockRejectedValue(new Error("unavailable"));
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(
          screen.getByText("Image Service unavailable."),
        ).toBeInTheDocument(),
      );
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    it("calls browseFolders again when Retry is clicked", async () => {
      mockBrowseFolders.mockRejectedValueOnce(new Error("unavailable"));
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("Retry")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText("Retry"));
      expect(mockBrowseFolders).toHaveBeenCalledTimes(2);
    });
  });

  describe("folder navigation", () => {
    it("calls browseFolders with the folder id when a folder tile is clicked", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("My Subfolder")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText("My Subfolder"));
      expect(mockBrowseFolders).toHaveBeenCalledWith(10);
    });

    it("shows breadcrumbs when inside a subfolder", async () => {
      mockBrowseFolders.mockResolvedValue(SUBFOLDER_RESPONSE);
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("My Subfolder")).toBeInTheDocument(),
      );
      expect(screen.getByText("›")).toBeInTheDocument();
    });

    it("calls browseFolders with no args when the root breadcrumb is clicked", async () => {
      mockBrowseFolders.mockResolvedValue(SUBFOLDER_RESPONSE);
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("My Subfolder")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByText("Image Library"));
      expect(mockBrowseFolders).toHaveBeenLastCalledWith(undefined);
    });

    it("root breadcrumb is disabled and non-interactive when at root", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByText("photo.jpg")).toBeInTheDocument(),
      );
      const rootBtn = screen.getByText("Image Library");
      expect(rootBtn).toBeDisabled();
    });
  });

  describe("image insertion — variant buttons", () => {
    it("calls onPick with thumb URL when Thumb is clicked", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByTitle("Insert Thumb")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTitle("Insert Thumb"));
      expect(DEFAULT_PROPS.onPick).toHaveBeenCalledWith(
        "/image-storage/did:test:user/abc123/thumb.webp",
        "photo.jpg",
      );
    });

    it("calls onClose after onPick", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByTitle("Insert Thumb")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTitle("Insert Thumb"));
      expect(DEFAULT_PROPS.onClose).toHaveBeenCalled();
    });

    it("calls onPick with the split variant URL when the main split button is clicked", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} />);
      await waitFor(() =>
        expect(screen.getByTitle("Insert Max")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTitle("Insert Max"));
      expect(DEFAULT_PROPS.onPick).toHaveBeenCalledWith(
        "/image-storage/did:test:user/abc123/max.webp",
        "photo.jpg",
      );
    });
  });

  describe("forcedVariant mode", () => {
    it("clicking an image tile calls onPick with the forced variant", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} forcedVariant="max" />);
      await waitFor(() =>
        expect(screen.getByTitle("Insert photo.jpg")).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByTitle("Insert photo.jpg"));
      expect(DEFAULT_PROPS.onPick).toHaveBeenCalledWith(
        "/image-storage/did:test:user/abc123/max.webp",
        "photo.jpg",
      );
    });

    it("does not render variant buttons when forcedVariant is set", async () => {
      render(<ImagePickerModal {...DEFAULT_PROPS} forcedVariant="max" />);
      await waitFor(() =>
        expect(screen.getByTitle("Insert photo.jpg")).toBeInTheDocument(),
      );
      expect(screen.queryByTitle("Insert Thumb")).not.toBeInTheDocument();
    });
  });
});
