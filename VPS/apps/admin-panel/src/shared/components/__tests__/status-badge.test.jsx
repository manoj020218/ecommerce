import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../status-badge";

describe("StatusBadge", () => {
  it("renders the label text when provided", () => {
    render(<StatusBadge value="active" label="Custom Label" />);
    expect(screen.getByText("Custom Label")).toBeInTheDocument();
  });

  it("auto-formats status value when no label given", () => {
    render(<StatusBadge value="out_of_stock" />);
    expect(screen.getByText("Out Of Stock")).toBeInTheDocument();
  });

  it("applies the correct colour class for known statuses", () => {
    const { container } = render(<StatusBadge value="paid" />);
    expect(container.firstChild).toHaveClass("status-pill", "green");
  });

  it("falls back to gray for unknown status values", () => {
    const { container } = render(<StatusBadge value="unknown_xyz" />);
    expect(container.firstChild).toHaveClass("status-pill", "gray");
  });

  it("handles empty/null value gracefully", () => {
    const { container } = render(<StatusBadge value={null} />);
    expect(container.firstChild).toHaveClass("gray");
  });

  it("is case-insensitive when matching status", () => {
    const { container } = render(<StatusBadge value="ACTIVE" />);
    expect(container.firstChild).toHaveClass("green");
  });
});
