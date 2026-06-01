import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input name="test" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders a label linked to the input via id", () => {
    render(<Input name="email" label="Email Address" id="email" />);
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
  });

  it("does not render a label when label prop is omitted", () => {
    const { container } = render(<Input name="test" id="test" />);
    expect(container.querySelector("label")).not.toBeInTheDocument();
  });

  it("renders an error message when provided", () => {
    render(<Input name="test" error="This field is required" />);
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("renders no error text when error is omitted", () => {
    const { container } = render(<Input name="test" />);
    expect(container.querySelector("span")).not.toBeInTheDocument();
  });

  it("forwards HTML attributes to the input element", () => {
    render(
      <Input
        name="username"
        placeholder="Enter username"
        type="search"
        defaultValue="hello"
      />,
    );
    const input = screen.getByRole("searchbox");
    expect(input).toHaveAttribute("placeholder", "Enter username");
    expect(input).toHaveValue("hello");
  });

  it("forwards the name attribute", () => {
    render(<Input name="my-field" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("name", "my-field");
  });
});
