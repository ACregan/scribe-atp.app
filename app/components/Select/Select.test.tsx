import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Select } from "./Select";
import type { SelectOption } from "./Select";

const options: SelectOption[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

describe("Select — single mode", () => {
  it("renders a select element with options", () => {
    render(<Select name="fruit" options={options} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
  });

  it("renders a label linked to the select via id", () => {
    render(<Select name="fruit" options={options} label="Favourite fruit" id="fruit" />);
    expect(screen.getByLabelText("Favourite fruit")).toBeInTheDocument();
  });

  it("renders no label when label prop is omitted", () => {
    const { container } = render(<Select name="fruit" options={options} />);
    expect(container.querySelector("label")).not.toBeInTheDocument();
  });

  it("reflects the controlled value", () => {
    render(<Select name="fruit" options={options} value="banana" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveValue("banana");
  });

  it("calls onChange with the selected value", () => {
    const onChange = vi.fn();
    render(<Select name="fruit" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cherry" } });
    expect(onChange).toHaveBeenCalledWith("cherry");
  });

  it("renders an error message when provided", () => {
    render(<Select name="fruit" options={options} error="Please select an option" />);
    expect(screen.getByText("Please select an option")).toBeInTheDocument();
  });

  it("renders no error when error is omitted", () => {
    const { container } = render(<Select name="fruit" options={options} />);
    expect(container.querySelector("span")).not.toBeInTheDocument();
  });
});

describe("Select — multi mode", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockClear();
  });

  it("renders a trigger button instead of a native select", () => {
    render(<Select name="fruit" options={options} multiple value={[]} onChange={onChange} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows 'Select options' when nothing is selected", () => {
    render(<Select name="fruit" options={options} multiple value={[]} onChange={onChange} />);
    expect(screen.getByText("Select options")).toBeInTheDocument();
  });

  it("shows the option label when exactly one item is selected", () => {
    render(<Select name="fruit" options={options} multiple value={["banana"]} onChange={onChange} />);
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });

  it("shows a count when multiple items are selected", () => {
    render(
      <Select name="fruit" options={options} multiple value={["apple", "cherry"]} onChange={onChange} />,
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("opens the dropdown when the trigger is clicked", () => {
    render(<Select name="fruit" options={options} multiple value={[]} onChange={onChange} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("checkbox")).toHaveLength(options.length);
  });

  it("closes the dropdown when the trigger is clicked again", () => {
    render(<Select name="fruit" options={options} multiple value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("reflects checked state for selected values", () => {
    render(
      <Select name="fruit" options={options} multiple value={["apple"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("checkbox", { name: "Apple" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Banana" })).not.toBeChecked();
  });

  it("calls onChange with added value when a checkbox is checked", () => {
    render(
      <Select name="fruit" options={options} multiple value={["apple"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Banana" }));
    expect(onChange).toHaveBeenCalledWith(["apple", "banana"]);
  });

  it("calls onChange with value removed when a checkbox is unchecked", () => {
    render(
      <Select name="fruit" options={options} multiple value={["apple", "banana"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Apple" }));
    expect(onChange).toHaveBeenCalledWith(["banana"]);
  });

  it("renders hidden inputs for each selected value for form submission", () => {
    const { container } = render(
      <Select name="fruit" options={options} multiple value={["apple", "cherry"]} onChange={onChange} />,
    );
    const hiddenInputs = container.querySelectorAll('input[type="hidden"][name="fruit"]');
    expect(hiddenInputs).toHaveLength(2);
    const values = Array.from(hiddenInputs).map((i) => (i as HTMLInputElement).value);
    expect(values).toContain("apple");
    expect(values).toContain("cherry");
  });

  it("renders no hidden inputs when nothing is selected", () => {
    const { container } = render(
      <Select name="fruit" options={options} multiple value={[]} onChange={onChange} />,
    );
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0);
  });

  it("closes the dropdown when Escape is pressed", () => {
    render(<Select name="fruit" options={options} multiple value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("checkbox")).toHaveLength(options.length);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("closes the dropdown when clicking outside the component", () => {
    render(<Select name="fruit" options={options} multiple value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("checkbox")).toHaveLength(options.length);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows 'No options available' when options array is empty", () => {
    render(<Select name="fruit" options={[]} multiple value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No options available")).toBeInTheDocument();
  });

  it("renders a label when provided", () => {
    render(
      <Select name="fruit" options={options} multiple value={[]} onChange={onChange} label="Pick fruits" />,
    );
    expect(screen.getByText("Pick fruits")).toBeInTheDocument();
  });

  it("renders an error message when provided", () => {
    render(
      <Select name="fruit" options={options} multiple value={[]} onChange={onChange} error="Required" />,
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
  });
});
