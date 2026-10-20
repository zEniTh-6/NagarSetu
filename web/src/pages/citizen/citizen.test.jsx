import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { citizen, json, mockApi, renderApp } from "../../test/utils.jsx";

vi.mock("../../lib/image.js", async (orig) => ({
  ...(await orig()),
  preparePhoto: vi.fn(async () => ({ blob: new Blob(["jpeg"], { type: "image/jpeg" }), width: 1600, height: 1200, capturedAt: 1760000000000 })),
}));
vi.mock("../../components/citizen/PinMap.jsx", () => ({ default: () => <div>map preview</div> }));
vi.mock("../../components/citizen/IssuesMap.jsx", () => ({ default: ({ issues }) => <ul aria-label="map pins">{issues.map((i) => <li key={i.id}>{i.id}</li>)}</ul> }));

const ID = "3f8a2c10-0000-4000-8000-000000000001";
const ID2 = "9b1d4e20-0000-4000-8000-000000000002";
const issue = (over = {}) => ({
  id: ID,
  status: "REPORTED",
  statusReason: null,
  rejectionType: null,
  duplicateOfId: null,
  category: { key: "ROADS", name: "Roads" },
  description: "Deep pothole near the bus stop",
  location: { lat: 16.8524, lng: 74.5815 },
  addressText: "MG Road",
  photo: { id: "p1", url: "/api/photos/p1" },
  createdAt: "2026-10-18T08:00:00Z",
  validation: { state: "OK" },
  suggestedCategory: null,
  timeline: [{ type: "REPORTED", at: "2026-10-18T08:00:00Z" }],
  relation: "REPORTER",
  ...over,
});
const page = (items) => json(200, { items, page: 1, pageSize: 50, total: items.length });
const base = (extra = {}) => ({
  "GET /api/auth/me": () => json(200, { user: citizen }),
  "GET /api/notifications": () => json(200, { items: [], unread: 0, total: 0, page: 1, pageSize: 50 }),
  "GET /api/issues/mine": () => page([]),
  "GET /api/issues/supporting": () => page([]),
  ...extra,
});

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("issue detail", () => {
  it("shows the timeline, and the reporter can withdraw while REPORTED", async () => {
    let current = issue();
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: current }),
        [`POST /api/issues/${ID}/withdraw`]: () => {
          current = issue({ status: "WITHDRAWN", statusReason: "Neighbours fixed it", timeline: [...current.timeline, { type: "WITHDRAWN", at: "2026-10-18T09:00:00Z" }] });
          return json(200, { issue: current });
        },
      }),
    );
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByText("Deep pothole near the bus stop")).toBeInTheDocument();
    const timeline = screen.getByRole("list", { name: "Progress" });
    expect(within(timeline).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Reported"),
      expect.stringContaining("Accepted by the department"),
      expect.stringContaining("Work started"),
      expect.stringContaining("Resolved"),
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Withdraw report" }));
    const dialog = screen.getByRole("dialog", { name: "Withdraw this report?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Neighbours fixed it");
    await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText("You withdrew this report")).toBeInTheDocument();
    expect(JSON.parse(fetch.mock.calls.find(([u]) => u.endsWith("/withdraw"))[1].body)).toEqual({ reason: "Neighbours fixed it" });
    expect(screen.queryByRole("button", { name: "Withdraw report" })).not.toBeInTheDocument();
  });

  it("a supporter can't withdraw, and an accepted report has no withdraw button", async () => {
    mockApi(base({ [`GET /api/issues/${ID}`]: () => json(200, { issue: issue({ relation: "SUPPORTER" }) }), [`GET /api/issues/${ID2}`]: () => json(200, { issue: issue({ id: ID2, status: "ACKNOWLEDGED" }) }) }));
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByText("You support this")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw report" })).not.toBeInTheDocument();
  });

  it("asks for a retake when the AI said INVALID, and shows the AI reason as a suggestion", async () => {
    mockApi(base({ [`GET /api/issues/${ID}`]: () => json(200, { issue: issue({ validation: { state: "RETAKE_REQUESTED", reason: "Looks like a screenshot" } }) }) }));
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByText("Please take a new photo")).toBeInTheDocument();
    expect(screen.getByText(/Looks like a screenshot/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Take a new photo" })).toHaveAttribute("href", `/citizen/issues/${ID}/retake`);
  });

  it("shows the AI category suggestion as information only (no change button, D-017)", async () => {
    mockApi(base({ [`GET /api/issues/${ID}`]: () => json(200, { issue: issue({ suggestedCategory: { key: "GARBAGE", name: "Garbage" } }) }) }));
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByText("This may be a Garbage issue")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change/i })).not.toBeInTheDocument();
  });

  it("forwarded: tells the citizen why", async () => {
    mockApi(base({ [`GET /api/issues/${ID}`]: () => json(200, { issue: issue({ status: "REJECTED", rejectionType: "NOT_OUR_JURISDICTION", statusReason: "State highway: sent to PWD" }) }) }));
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByText("Forwarded to another authority")).toBeInTheDocument();
    expect(screen.getByText(/State highway: sent to PWD/)).toBeInTheDocument();
  });

  it("resolved: before/after and 'Yes, fixed' sends FIXED", async () => {
    let answered = false;
    const resolved = () =>
      issue({
        status: "RESOLVED",
        resolution: { resolvedAt: "2026-10-22T10:00:00Z", photo: { id: "p2", url: "/api/photos/p2" } },
        feedback: answered ? { canRespond: false, windowEndsAt: "2026-11-05T10:00:00Z", myResponse: { verdict: "FIXED", reason: null } } : { canRespond: true, windowEndsAt: "2026-11-05T10:00:00Z", myResponse: null },
      });
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: resolved() }),
        [`POST /api/issues/${ID}/feedback`]: () => {
          answered = true;
          return json(201, { feedback: {} });
        },
      }),
    );
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByAltText("Repair photo approved by the department")).toHaveAttribute("src", "/api/photos/p2");
    await userEvent.click(screen.getByRole("button", { name: "Yes, fixed" }));
    expect(await screen.findByText("You said it is fixed")).toBeInTheDocument();
    expect(fetch.mock.calls.find(([u]) => u.endsWith("/feedback"))[1].body.get("verdict")).toBe("FIXED");
  });

  it("'Not fixed' needs a reason, sends NOT_FIXED with the photo, and only adds a dispute", async () => {
    let answered = false;
    const resolved = () =>
      issue({
        status: "RESOLVED",
        resolution: { resolvedAt: "2026-10-22T10:00:00Z", photo: null },
        feedback: answered ? { canRespond: false, windowEndsAt: "2026-11-05T10:00:00Z", myResponse: { verdict: "NOT_FIXED", reason: "Hole is back" } } : { canRespond: true, windowEndsAt: "2026-11-05T10:00:00Z", myResponse: null },
      });
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: resolved() }),
        [`POST /api/issues/${ID}/feedback`]: () => {
          answered = true;
          return json(201, { feedback: {} });
        },
      }),
    );
    const { router } = renderApp(`/citizen/issues/${ID}/not-fixed`);
    await userEvent.click(await screen.findByRole("button", { name: "Send to the department" }));
    expect(screen.getByText("Write at least 3 characters.")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => u.endsWith("/feedback"))).toBe(false);

    await userEvent.type(screen.getByLabelText(/What is still wrong/), "Hole is back");
    fireEvent.change(screen.getByTestId("photo-gallery"), { target: { files: [new File(["x"], "still.jpg", { type: "image/jpeg" })] } });
    await screen.findByAltText("Photo");
    await userEvent.click(screen.getByRole("button", { name: "Send to the department" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/issues/${ID}`));
    const body = fetch.mock.calls.find(([u]) => u.endsWith("/feedback"))[1].body;
    expect(body.get("verdict")).toBe("NOT_FIXED");
    expect(body.get("reason")).toBe("Hole is back");
    expect(body.get("photo")).toBeInstanceOf(Blob);
    expect(await screen.findByText("You said it is not fixed")).toBeInTheDocument();
    expect(screen.getByText("Resolved", { selector: "span" })).toBeInTheDocument(); // still RESOLVED
  });
});

describe("retake photo", () => {
  it("uploads the new photo and returns to the report", async () => {
    let state = "RETAKE_REQUESTED";
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: issue({ validation: state === "RETAKE_REQUESTED" ? { state, reason: "Screenshot" } : { state } }) }),
        [`POST /api/issues/${ID}/photo`]: () => {
          state = "CHECKING";
          return json(200, { issue: issue({ validation: { state: "CHECKING" } }) });
        },
      }),
    );
    const { router } = renderApp(`/citizen/issues/${ID}/retake`);
    fireEvent.change(await screen.findByTestId("photo-gallery"), { target: { files: [new File(["x"], "new.jpg", { type: "image/jpeg" })] } });
    await userEvent.click(await screen.findByRole("button", { name: "Send new photo" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/issues/${ID}`));
    expect(fetch.mock.calls.find(([u]) => u.endsWith("/photo"))[1].body.get("photo")).toBeInstanceOf(Blob);
    expect(await screen.findByText("Checking your photo")).toBeInTheDocument();
  });
});

describe("my complaints", () => {
  it("splits by status (no 'Closed' tab) and lists supported issues under Supporting", async () => {
    mockApi(
      base({
        "GET /api/issues/mine": () =>
          page([
            issue({ id: "a0000000-0000-4000-8000-000000000001", description: "Active one" }),
            issue({ id: "a0000000-0000-4000-8000-000000000002", status: "RESOLVED", description: "Fixed one" }),
            issue({ id: "a0000000-0000-4000-8000-000000000003", status: "WITHDRAWN", description: "Withdrawn one" }),
          ]),
        "GET /api/issues/supporting": () => page([issue({ id: ID2, status: "IN_PROGRESS", description: "Someone else's report", relation: "SUPPORTER", supportedAt: "2026-10-19T08:00:00Z" })]),
      }),
    );
    renderApp("/citizen/complaints");
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent.replace(/\s*\(\d+\)/, ""))).toEqual(["Active", "Resolved", "Rejected / withdrawn", "Supporting"]);
    expect(await screen.findByText("Active one")).toBeInTheDocument();
    expect(screen.queryByText("Fixed one")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Rejected \/ withdrawn/ }));
    expect(screen.getByText("Withdrawn one")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Supporting/ }));
    expect(await screen.findByText("Someone else's report")).toBeInTheDocument();
    expect(screen.getByText("You support this report")).toBeInTheDocument();
  });
});

describe("notifications", () => {
  it("polls, shows the unread badge, writes the text in the user's language and opens the issue", async () => {
    let unread = true;
    const fetch = mockApi(
      base({
        "GET /api/notifications": () =>
          json(200, {
            items: [{ id: "n1", type: "REJECTED", issueId: ID, params: { rejectionType: "NOT_OUR_JURISDICTION", reason: "State highway" }, readAt: unread ? null : "2026-10-20T09:00:00Z", createdAt: "2026-10-20T08:00:00Z" }],
            unread: unread ? 1 : 0,
            total: 1,
            page: 1,
            pageSize: 50,
          }),
        "POST /api/notifications/n1/read": () => {
          unread = false;
          return json(200, {});
        },
        [`GET /api/issues/${ID}`]: () => json(200, { issue: issue() }),
      }),
    );
    const { router } = renderApp("/citizen/notifications");
    expect(await screen.findByText("The report was forwarded to another authority")).toBeInTheDocument();
    expect(screen.getByText("State highway")).toBeInTheDocument();
    expect(screen.getAllByText("1 unread").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /forwarded to another authority/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/issues/${ID}`));
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => u === "/api/notifications/n1/read")).toBe(true));
  });
});

describe("home, map and profile", () => {
  it("home shows counts and recent reports; map shows mine + supported once each", async () => {
    mockApi(
      base({
        "GET /api/issues/mine": () => page([issue()]),
        "GET /api/issues/supporting": () => page([issue({ id: ID2, relation: "SUPPORTER" }), issue()]),
      }),
    );
    const { router } = renderApp("/citizen");
    expect(await screen.findByText("Deep pothole near the bus stop")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Report an issue" })).toHaveAttribute("href", "/citizen/report");

    await router.navigate("/citizen/map");
    const pins = await screen.findByRole("list", { name: "map pins" });
    expect(within(pins).getAllByRole("listitem").map((li) => li.textContent)).toEqual([ID, ID2]);
  });

  it("profile has the language switch and no SMS/WhatsApp settings", async () => {
    mockApi(base());
    renderApp("/citizen/profile");
    expect(await screen.findByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(screen.queryByText(/SMS|WhatsApp/)).not.toBeInTheDocument();
  });
});
