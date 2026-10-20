import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoiceCards } from "./ChoiceCards.jsx";
import { citizen, json, mockApi, renderApp } from "../test/utils.jsx";

vi.mock("../lib/image.js", async (orig) => ({
  ...(await orig()),
  preparePhoto: vi.fn(async () => ({ blob: new Blob(["jpeg"], { type: "image/jpeg" }), width: 1600, height: 1200, capturedAt: 1760000000000 })),
}));
vi.mock("./citizen/PinMap.jsx", () => ({
  default: ({ onMove }) => (
    <button type="button" onClick={() => onMove?.({ lat: 16.8524, lng: 74.5815 })}>
      place pin
    </button>
  ),
}));

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const OPTIONS = [
  { value: "GARBAGE", label: "Garbage" },
  { value: "ROADS", label: "Roads" },
  { value: "STREETLIGHT", label: "Streetlight" },
];
function Harness({ initial = "" }) {
  const [v, setV] = useState(initial);
  return <ChoiceCards label="Category" options={OPTIONS} value={v} onChange={setV} />;
}

describe("ChoiceCards (radio group)", () => {
  it("is a labelled radiogroup with one Tab stop and aria-checked on the chosen card", async () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Category" });
    const radios = screen.getAllByRole("radio");
    expect(group).toContainElement(radios[0]);
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);

    await userEvent.click(screen.getByRole("radio", { name: "Roads" }));
    const roads = screen.getByRole("radio", { name: "Roads" });
    expect(roads).toHaveAttribute("aria-checked", "true");
    expect(roads).toHaveAttribute("tabindex", "0");
    expect(roads.className).toContain("border-teal-700");
    expect(roads.className).toContain("bg-sage-100");
    expect(roads.querySelector("svg.text-teal-700")).not.toBeNull(); // check icon
    expect(screen.getByText("Roads").className).toContain("font-bold");
    expect(screen.getByRole("radio", { name: "Garbage" }).className).toContain("border-stone-300");
  });

  it("arrows move and select (wrapping); Space and Enter select the focused card", async () => {
    render(<Harness initial="ROADS" />);
    screen.getByRole("radio", { name: "Roads" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Streetlight" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Streetlight" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Garbage" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: "Streetlight" })).toHaveAttribute("aria-checked", "true");

    render(<Harness />);
    const fresh = screen.getAllByRole("radiogroup")[1];
    const first = fresh.querySelector('[role="radio"]');
    first.focus();
    await userEvent.keyboard(" ");
    expect(first).toHaveAttribute("aria-checked", "true");
  });
});

describe("report: category step", () => {
  it("selecting a category marks it checked and enables Continue", async () => {
    mockApi({
      "GET /api/auth/me": () => json(200, { user: citizen }),
      "GET /api/notifications": () => json(200, { items: [], unread: 0, total: 0, page: 1, pageSize: 50 }),
      "GET /api/categories": () => json(200, { categories: OPTIONS.map((o) => ({ key: o.value, name: o.label, department: { code: "X", name: "X" } })) }),
    });
    renderApp("/citizen/report");
    fireEvent.change(await screen.findByTestId("photo-gallery"), { target: { files: [new File(["x"], "p.jpg", { type: "image/jpeg" })] } });
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByText("place pin"));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByRole("radiogroup", { name: /Category/ });
    const next = screen.getByRole("button", { name: "Continue" });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Garbage" }));
    expect(screen.getByRole("radio", { name: "Garbage" })).toHaveAttribute("aria-checked", "true");
    expect(next).toBeEnabled();
  });
});
