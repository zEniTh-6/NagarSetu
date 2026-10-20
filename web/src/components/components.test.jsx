import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OtpInput } from "./OtpInput.jsx";
import { Modal } from "./Modal.jsx";
import { StatusBadge } from "./StatusBadge.jsx";
import { FlagChip } from "./FlagChip.jsx";
import { PriorityPill } from "./PriorityPill.jsx";
import { AiVerdictChip } from "./AiVerdictChip.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";
import { Timeline } from "./Timeline.jsx";
import { PhotoCompare } from "./PhotoCompare.jsx";
import { ToastProvider, useToast } from "./Toast.jsx";
import i18n from "../i18n/index.js";

function Otp({ onComplete }) {
  const [v, setV] = useState("");
  return (
    <>
      <OtpInput value={v} onChange={setV} onComplete={onComplete} />
      <output data-testid="v">{v}</output>
    </>
  );
}

describe("OtpInput", () => {
  it("moves forward while typing and reports the full code", async () => {
    const onComplete = vi.fn();
    render(<Otp onComplete={onComplete} />);
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(6);
    boxes[0].focus();
    await userEvent.keyboard("123456");
    expect(screen.getByTestId("v")).toHaveTextContent("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("fills every box from a paste and ignores non-digits", () => {
    render(<Otp />);
    const boxes = screen.getAllByRole("textbox");
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => "12 34-56" } });
    expect(screen.getByTestId("v")).toHaveTextContent("123456");
  });

  it("Backspace on an empty box deletes the previous digit", async () => {
    render(<Otp />);
    const boxes = screen.getAllByRole("textbox");
    boxes[0].focus();
    await userEvent.keyboard("12");
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByTestId("v")).toHaveTextContent(/^1$/);
  });

  it("labels each box", () => {
    render(<Otp />);
    expect(screen.getByLabelText("Digit 1 of 6")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Assign contractor" footer={<button>Confirm</button>}>
          <input aria-label="inside" />
        </Modal>
      </>
    );
  }

  it("opens as a labelled dialog, closes on Escape and returns focus", async () => {
    render(<Harness />);
    const opener = screen.getByText("open");
    await userEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Assign contractor" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText("open"));
    const confirm = screen.getByText("Confirm");
    confirm.focus();
    await userEvent.tab();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  });
});

describe("badges and chips always carry text", () => {
  it("StatusBadge shows the status, and a jurisdiction rejection as Forwarded", () => {
    render(
      <>
        <StatusBadge status="IN_PROGRESS" />
        <StatusBadge status="REJECTED" rejectionType="NOT_OUR_JURISDICTION" />
        <StatusBadge status="DUPLICATE" />
      </>,
    );
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Forwarded")).toBeInTheDocument();
    expect(screen.getByText("Linked duplicate")).toBeInTheDocument();
  });

  it("FlagChip, PriorityPill and AiVerdictChip", () => {
    render(
      <>
        <FlagChip flag="ESCALATED" />
        <PriorityPill level="CRITICAL" />
        <AiVerdictChip verdict="UNCERTAIN" />
        <AiVerdictChip verdict={null} />
      </>,
    );
    expect(screen.getByText("Escalated")).toBeInTheDocument();
    expect(screen.getByText("Critical priority")).toBeInTheDocument();
    expect(screen.getByText("AI suggestion: Uncertain")).toBeInTheDocument();
    expect(screen.getByText("AI suggestion: Checking")).toBeInTheDocument();
  });
});

describe("LanguageSwitcher", () => {
  it("switches the language and the document lang", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("radio", { name: "मराठी" }));
    expect(i18n.language).toBe("mr");
    expect(document.documentElement.lang).toBe("mr");
    expect(screen.getByRole("radio", { name: "मराठी" })).toHaveAttribute("aria-checked", "true");
    await act(() => i18n.changeLanguage("en"));
  });
});

describe("Timeline and PhotoCompare", () => {
  it("marks the current step", () => {
    render(
      <Timeline
        steps={[
          { key: "a", title: "Reported", state: "done" },
          { key: "b", title: "In progress", state: "current" },
          { key: "c", title: "Resolved", state: "upcoming" },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
  });

  it("shows a placeholder until the repair photo exists", () => {
    render(<PhotoCompare before={{ src: "/a.jpg", alt: "pothole" }} />);
    expect(screen.getByAltText("pothole")).toBeInTheDocument();
    expect(screen.getByText("Repair photo not published yet")).toBeInTheDocument();
  });
});

describe("Toast", () => {
  it("shows a message from useToast()", async () => {
    function Shower() {
      const toast = useToast();
      return <button onClick={() => toast.show({ tone: "success", title: "Saved" })}>go</button>;
    }
    render(
      <ToastProvider>
        <Shower />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText("go"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
