import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ArticleContributors from "./ArticleContributors";

const fetcherMock = vi.hoisted(() => ({
  state: "idle" as "idle" | "loading" | "submitting",
  data: undefined as unknown,
  load: vi.fn(),
}));

vi.mock("react-router", () => ({
  useFetcher: () => fetcherMock,
}));

// Isolates ArticleContributors's own logic (rows, remove, avatar-fetch
// effect) from AddContributorModal's internals, which have their own test
// file. The mock exposes a button that fires onAdd with a fixed contributor
// (and optionally an avatar), standing in for a completed lookup + Add click.
const mockOnAdd = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../AddContributorModal/AddContributorModal", () => ({
  AddContributorModal: ({
    isOpen,
    onAdd,
  }: {
    isOpen: boolean;
    onAdd: (contributor: unknown, avatar?: string) => void;
  }) => {
    mockOnAdd.current = onAdd;
    return isOpen ? <div data-testid="mock-modal" /> : null;
  },
}));

const contributor = { did: "did:plc:a", role: "Editor", displayName: "A" };

beforeEach(() => {
  fetcherMock.state = "idle";
  fetcherMock.data = undefined;
  fetcherMock.load.mockClear();
});

describe("ArticleContributors", () => {
  it("renders no list when there are no contributors", () => {
    render(
      <ArticleContributors contributors={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText("Contributors")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders each contributor's role and display name", () => {
    render(
      <ArticleContributors
        contributors={[contributor]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("calls onRemove with the contributor's did", () => {
    const onRemove = vi.fn();
    render(
      <ArticleContributors
        contributors={[contributor]}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove A" }));
    expect(onRemove).toHaveBeenCalledWith("did:plc:a");
  });

  it("opens the modal when Add Contributor is clicked", () => {
    render(
      <ArticleContributors contributors={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.queryByTestId("mock-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Contributor" }));
    expect(screen.getByTestId("mock-modal")).toBeInTheDocument();
  });

  it("bubbles a newly-added contributor up via onAdd", () => {
    const onAdd = vi.fn();
    render(
      <ArticleContributors contributors={[]} onAdd={onAdd} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Contributor" }));
    (mockOnAdd.current as (c: unknown, a?: string) => void)(contributor);
    expect(onAdd).toHaveBeenCalledWith(contributor);
  });

  it("fetches avatars for contributor DIDs it hasn't seen yet", () => {
    render(
      <ArticleContributors
        contributors={[contributor]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(fetcherMock.load).toHaveBeenCalledWith(
      "/article/resolve-contributor?did=did%3Aplc%3Aa",
    );
  });

  it("does not fire a new avatar request while one is already in flight", () => {
    const { rerender } = render(
      <ArticleContributors
        contributors={[contributor]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(fetcherMock.load).toHaveBeenCalledTimes(1);
    fetcherMock.load.mockClear();

    // A second contributor arrives while the first request is still
    // in flight (fetcherMock.data hasn't resolved yet) — must wait.
    const contributor2 = { did: "did:plc:b", role: "Writer", displayName: "B" };
    rerender(
      <ArticleContributors
        contributors={[contributor, contributor2]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(fetcherMock.load).not.toHaveBeenCalled();
  });

  it("renders an avatar once the fetcher returns one for that did", () => {
    fetcherMock.data = { profiles: [{ did: "did:plc:a", avatar: "https://x/a.jpg" }] };
    const { container } = render(
      <ArticleContributors
        contributors={[contributor]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://x/a.jpg",
    );
  });

  it("seeds the avatar directly from the modal instead of re-fetching when one is already known", () => {
    const onAdd = vi.fn();
    const { rerender } = render(
      <ArticleContributors contributors={[]} onAdd={onAdd} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Contributor" }));
    fetcherMock.load.mockClear();
    (mockOnAdd.current as (c: unknown, a?: string) => void)(
      contributor,
      "https://x/a.jpg",
    );
    // onAdd still bubbles the contributor up to the parent (ArticleForm) —
    // the avatar itself stays local to this component.
    expect(onAdd).toHaveBeenCalledWith(contributor);

    // Once the parent reflects the new contributor back down as a prop, the
    // avatar-fetch effect must not re-request it — it was already seeded.
    rerender(
      <ArticleContributors
        contributors={[contributor]}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    );
    expect(fetcherMock.load).not.toHaveBeenCalled();
  });
});
