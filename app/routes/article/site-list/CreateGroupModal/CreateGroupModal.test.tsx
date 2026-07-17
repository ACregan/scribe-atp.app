import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateGroupModal } from "./CreateGroupModal";

const fetcherMock = vi.hoisted(() => ({
  state: "idle" as "idle" | "loading" | "submitting",
  data: undefined as { error?: string } | undefined,
  Form: ({ children, ...props }: { children: React.ReactNode }) => (
    <form {...props}>{children}</form>
  ),
}));

vi.mock("react-router", () => ({
  useFetcher: () => fetcherMock,
}));

const noop = () => {};

beforeEach(() => {
  fetcherMock.state = "idle";
  fetcherMock.data = undefined;
});

describe("CreateGroupModal", () => {
  it("auto-populates the slug from the title until the user edits it directly", () => {
    render(
      <CreateGroupModal isOpen onClose={noop} siteUrl="example.com" urlPrefix="blog" />,
    );
    fireEvent.change(screen.getByLabelText("Group title"), {
      target: { value: "Engineering" },
    });
    expect(screen.getByLabelText("URL path")).toHaveValue("engineering");
  });

  it("stops auto-populating the slug once the user edits it manually", () => {
    render(
      <CreateGroupModal isOpen onClose={noop} siteUrl="example.com" urlPrefix="blog" />,
    );
    fireEvent.change(screen.getByLabelText("Group title"), {
      target: { value: "Engineering" },
    });
    fireEvent.change(screen.getByLabelText("URL path"), {
      target: { value: "custom-slug" },
    });
    fireEvent.change(screen.getByLabelText("Group title"), {
      target: { value: "Engineering Team" },
    });
    expect(screen.getByLabelText("URL path")).toHaveValue("custom-slug");
  });

  it("shows the composed path once a valid slug is present", () => {
    render(
      <CreateGroupModal isOpen onClose={noop} siteUrl="example.com" urlPrefix="blog" />,
    );
    fireEvent.change(screen.getByLabelText("URL path"), {
      target: { value: "engineering" },
    });
    expect(screen.getByText("example.com/blog/engineering")).toBeInTheDocument();
  });

  it("shows a validation error for an invalid slug and disables the submit button", () => {
    render(
      <CreateGroupModal isOpen onClose={noop} siteUrl="example.com" urlPrefix="blog" />,
    );
    fireEvent.change(screen.getByLabelText("URL path"), {
      target: { value: "Not Valid!" },
    });
    expect(
      screen.getByText("Lowercase letters, numbers and hyphens only."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Group" })).toBeDisabled();
  });

  it("disables submit until both title and a valid slug are present", () => {
    render(
      <CreateGroupModal isOpen onClose={noop} siteUrl="example.com" urlPrefix="blog" />,
    );
    expect(screen.getByRole("button", { name: "Create Group" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Group title"), {
      target: { value: "Engineering" },
    });
    expect(screen.getByRole("button", { name: "Create Group" })).not.toBeDisabled();
  });

  it("shows the fetcher's error message when the submission fails", () => {
    fetcherMock.data = { error: "A group with this name already exists." };
    render(
      <CreateGroupModal isOpen onClose={noop} siteUrl="example.com" urlPrefix="blog" />,
    );
    expect(
      screen.getByText("A group with this name already exists."),
    ).toBeInTheDocument();
  });

  it("shows a pending label while the submission is in flight", () => {
    fetcherMock.state = "submitting";
    render(
      <CreateGroupModal isOpen onClose={noop} siteUrl="example.com" urlPrefix="blog" />,
    );
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  });
});
