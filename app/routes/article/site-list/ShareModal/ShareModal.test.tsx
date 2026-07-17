import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShareModal } from "./ShareModal";

const article = {
  uri: "at://did:plc:owner/site.standard.document/abc",
  title: "My Article",
  bskyPostRef: null,
};

const noop = () => {};

describe("ShareModal", () => {
  it("renders nothing extra when there is no article to share", () => {
    render(
      <ShareModal
        isOpen
        onClose={noop}
        article={null}
        isSharing={false}
        onSubmit={noop}
      />,
    );
    expect(screen.queryByLabelText("Post text")).not.toBeInTheDocument();
  });

  it("pre-fills the post text with the article's title", () => {
    render(
      <ShareModal
        isOpen
        onClose={noop}
        article={article}
        isSharing={false}
        onSubmit={noop}
      />,
    );
    expect(screen.getByLabelText("Post text")).toHaveValue("My Article");
  });

  it("shows Share (not Re-share) and no warning for a never-shared article", () => {
    render(
      <ShareModal
        isOpen
        onClose={noop}
        article={article}
        isSharing={false}
        onSubmit={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.queryByText(/already been shared/)).not.toBeInTheDocument();
  });

  it("shows Re-share and a warning for an already-shared article", () => {
    const shared = {
      ...article,
      bskyPostRef: { uri: "at://post", cid: "cid" },
    };
    render(
      <ShareModal
        isOpen
        onClose={noop}
        article={shared}
        isSharing={false}
        onSubmit={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Re-share" })).toBeInTheDocument();
    expect(screen.getByText(/already been shared/)).toBeInTheDocument();
  });

  it("calls onSubmit with the form data (including edited text) when the share button is clicked", () => {
    const onSubmit = vi.fn();
    render(
      <ShareModal
        isOpen
        onClose={noop}
        article={article}
        isSharing={false}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Post text"), {
      target: { value: "Edited post text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.any(FormData));
    const submitted = onSubmit.mock.calls[0][0] as FormData;
    expect(submitted.get("_intent")).toBe("shareToBluesky");
    expect(submitted.get("uri")).toBe(article.uri);
    expect(submitted.get("text")).toBe("Edited post text");
  });

  it("disables the share button and shows a pending label while isSharing", () => {
    render(
      <ShareModal
        isOpen
        onClose={noop}
        article={article}
        isSharing
        onSubmit={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Sharing…" })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <ShareModal
        isOpen
        onClose={onClose}
        article={article}
        isSharing={false}
        onSubmit={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
