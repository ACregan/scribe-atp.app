import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewSubmissionToasts } from "./core";
import { useToast } from "~/components/Toast/ToastContext";

vi.mock("~/components/Toast/ToastContext", () => ({
  useToast: vi.fn(),
}));

const addToast = vi.fn();

beforeEach(() => {
  addToast.mockClear();
  vi.mocked(useToast).mockReturnValue({
    addToast,
    toasts: [],
    removeToast: vi.fn(),
  });
  sessionStorage.clear();
});

describe("NewSubmissionToasts", () => {
  it("shows a toast for each submission not yet seen this session", () => {
    render(
      <NewSubmissionToasts
        submissions={[
          { documentUri: "at://a/site.standard.document/1", documentTitle: "Article One" },
          { documentUri: "at://b/site.standard.document/2", documentTitle: "Article Two" },
        ]}
      />,
    );

    expect(addToast).toHaveBeenCalledTimes(2);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: "New article submission",
        autoExpire: false,
      }),
    );
  });

  it("does not re-toast a submission already recorded in sessionStorage", () => {
    sessionStorage.setItem(
      "scribe-toasted-submission-uris",
      JSON.stringify(["at://a/site.standard.document/1"]),
    );

    render(
      <NewSubmissionToasts
        submissions={[
          { documentUri: "at://a/site.standard.document/1", documentTitle: "Article One" },
        ]}
      />,
    );

    expect(addToast).not.toHaveBeenCalled();
  });

  it("shows nothing when the submissions list is empty", () => {
    render(<NewSubmissionToasts submissions={[]} />);
    expect(addToast).not.toHaveBeenCalled();
  });

  it("records newly-toasted URIs in sessionStorage so a re-render doesn't re-toast them", () => {
    const { rerender } = render(
      <NewSubmissionToasts
        submissions={[
          { documentUri: "at://a/site.standard.document/1", documentTitle: "Article One" },
        ]}
      />,
    );
    expect(addToast).toHaveBeenCalledTimes(1);

    addToast.mockClear();
    rerender(
      <NewSubmissionToasts
        submissions={[
          { documentUri: "at://a/site.standard.document/1", documentTitle: "Article One" },
        ]}
      />,
    );
    expect(addToast).not.toHaveBeenCalled();
  });

  it("only toasts the genuinely new submission when mixed with an already-seen one", () => {
    sessionStorage.setItem(
      "scribe-toasted-submission-uris",
      JSON.stringify(["at://a/site.standard.document/1"]),
    );

    render(
      <NewSubmissionToasts
        submissions={[
          { documentUri: "at://a/site.standard.document/1", documentTitle: "Article One" },
          { documentUri: "at://b/site.standard.document/2", documentTitle: "Article Two" },
        ]}
      />,
    );

    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ content: '"Article Two" is waiting for your review.' }),
    );
  });
});
