import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import TextArrayInput from "./TextArrayInput";

vi.mock("../SvgIcon/SvgIcon", () => ({
  default: ({ name }: any) => <span data-testid={`icon-${name}`} />,
  SvgImageList: new Proxy({}, { get: (_t, k) => String(k) }),
}));

// Stateful wrapper so add/remove interactions produce visible DOM changes.
function Wrapper({
  initialItems = [],
  onSetItems,
}: {
  initialItems?: string[];
  onSetItems?: (items: string[]) => void;
}) {
  const [items, setItems] = useState<string[]>(initialItems);
  return (
    <TextArrayInput
      id="test-input"
      label="Tags"
      placeholder="Add a tag…"
      textArrayItems={items}
      setTextArrayItems={(value) => {
        const next =
          typeof value === "function" ? value(items) : value;
        setItems(next);
        onSetItems?.(next);
      }}
    />
  );
}

describe("TextArrayInput", () => {
  describe("rendering", () => {
    it("renders the label linked to the input", () => {
      render(<Wrapper />);
      const label = screen.getByText("Tags");
      expect(label).toBeInTheDocument();
      expect(label.tagName).toBe("LABEL");
      expect(label).toHaveAttribute("for", "test-input");
    });

    it("does not render a label element when label prop is omitted", () => {
      render(
        <TextArrayInput
          id="no-label"
          textArrayItems={[]}
          setTextArrayItems={vi.fn()}
        />,
      );
      expect(screen.queryByRole("label")).not.toBeInTheDocument();
    });

    it("renders the text input with the correct id and placeholder", () => {
      render(<Wrapper />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("id", "test-input");
      expect(input).toHaveAttribute("placeholder", "Add a tag…");
    });

    it("renders existing items", () => {
      render(<Wrapper initialItems={["react", "typescript"]} />);
      expect(screen.getByText(/react/)).toBeInTheDocument();
      expect(screen.getByText(/typescript/)).toBeInTheDocument();
    });

    it("renders a remove button for each existing item", () => {
      render(<Wrapper initialItems={["a", "b", "c"]} />);
      expect(screen.getAllByTestId("remove-button")).toHaveLength(3);
    });

    it("renders no items when array is empty", () => {
      render(<Wrapper />);
      expect(screen.queryAllByTestId("remove-button")).toHaveLength(0);
    });
  });

  describe("adding items", () => {
    it("adds an item when the add button is clicked", async () => {
      render(<Wrapper />);
      await userEvent.type(screen.getByRole("textbox"), "newtag");
      await userEvent.click(screen.getByTestId("add-button"));
      expect(screen.getByText(/newtag/)).toBeInTheDocument();
    });

    it("does not clear the input after adding via button", async () => {
      render(<Wrapper />);
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "newtag");
      await userEvent.click(screen.getByTestId("add-button"));
      expect(input).toHaveValue("newtag");
    });

    it("adds an item when Enter is pressed", async () => {
      render(<Wrapper />);
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "entertag{Enter}");
      expect(screen.getByText(/entertag/)).toBeInTheDocument();
    });

    it("clears the input after adding via Enter", async () => {
      render(<Wrapper />);
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "sometag{Enter}");
      expect(input).toHaveValue("");
    });

    it("does not add an empty string via button click", async () => {
      render(<Wrapper />);
      await userEvent.click(screen.getByTestId("add-button"));
      expect(screen.queryAllByTestId("remove-button")).toHaveLength(0);
    });

    it("does not add an empty string via Enter", async () => {
      render(<Wrapper />);
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(screen.queryAllByTestId("remove-button")).toHaveLength(0);
    });

    it("does not add a duplicate item", async () => {
      render(<Wrapper initialItems={["react"]} />);
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "react");
      await userEvent.click(screen.getByTestId("add-button"));
      expect(screen.getAllByTestId("remove-button")).toHaveLength(1);
    });

    it("appends new items without removing existing ones", async () => {
      render(<Wrapper initialItems={["first"]} />);
      await userEvent.type(screen.getByRole("textbox"), "second{Enter}");
      expect(screen.getByText(/first/)).toBeInTheDocument();
      expect(screen.getByText(/second/)).toBeInTheDocument();
    });
  });

  describe("removing items", () => {
    it("removes an item when its remove button is clicked", async () => {
      render(<Wrapper initialItems={["react"]} />);
      await userEvent.click(screen.getByTestId("remove-button"));
      expect(screen.queryByText(/react/)).not.toBeInTheDocument();
    });

    it("removes only the targeted item, leaving others intact", async () => {
      render(<Wrapper initialItems={["keep", "remove-me"]} />);
      const removeButtons = screen.getAllByTestId("remove-button");
      // Second item's button (index 1 = "remove-me")
      await userEvent.click(removeButtons[1]);
      expect(screen.getByText(/keep/)).toBeInTheDocument();
      expect(screen.queryByText(/remove-me/)).not.toBeInTheDocument();
    });
  });

  describe("Escape key", () => {
    it("clears the input when Escape is pressed", async () => {
      render(<Wrapper />);
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "draft");
      fireEvent.keyDown(input, { key: "Escape" });
      expect(input).toHaveValue("");
    });

    it("does not add an item when Escape is pressed", async () => {
      render(<Wrapper />);
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "draft");
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryAllByTestId("remove-button")).toHaveLength(0);
    });
  });

  describe("input value", () => {
    it("updates as the user types", async () => {
      render(<Wrapper />);
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "hello");
      expect(input).toHaveValue("hello");
    });
  });
});
