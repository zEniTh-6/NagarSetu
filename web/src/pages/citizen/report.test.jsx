import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { citizen, json, mockApi, renderApp } from "../../test/utils.jsx";

// jsdom can't draw on a canvas or render Leaflet: stand-ins for the resize and the map.
vi.mock("../../lib/image.js", async (orig) => ({
  ...(await orig()),
  preparePhoto: vi.fn(async () => ({ blob: new Blob(["jpeg"], { type: "image/jpeg" }), width: 1600, height: 1200, capturedAt: 1760000000000 })),
}));
vi.mock("../../components/citizen/PinMap.jsx", () => ({
  default: ({ onMove, interactive = true }) =>
    interactive ? (
      <button type="button" onClick={() => onMove({ lat: 16.8524, lng: 74.5815 })}>
        place pin
      </button>
    ) : (
      <div>map preview</div>
    ),
}));

const CATEGORIES = {
  categories: [
    { key: "GARBAGE", name: "Garbage", department: { code: "SOLID_WASTE", name: "SWM" } },
    { key: "ROADS", name: "Roads", department: { code: "CONSTRUCTION", name: "Construction" } },
    { key: "STREETLIGHT", name: "Streetlight", department: { code: "ELECTRICAL", name: "Electrical" } },
  ],
};
const ISSUE_ID = "3f8a2c10-0000-4000-8000-000000000001";
const OTHER_ID = "9b1d4e20-0000-4000-8000-000000000002";
const createdIssue = { id: ISSUE_ID, status: "REPORTED", category: { key: "ROADS", name: "Roads" }, description: "Deep pothole near the bus stop", validation: { state: "CHECKING" }, createdAt: "2026-10-20T08:00:00Z", timeline: [], relation: "REPORTER" };

const base = (extra = {}) => ({
  "GET /api/auth/me": () => json(200, { user: citizen }),
  "GET /api/categories": () => json(200, CATEGORIES),
  "GET /api/notifications": () => json(200, { items: [], unread: 0, total: 0, page: 1, pageSize: 50 }),
  [`GET /api/issues/${ISSUE_ID}`]: () => json(200, { issue: createdIssue }),
  ...extra,
});

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function fillReport() {
  fireEvent.change(await screen.findByTestId("photo-gallery"), { target: { files: [new File(["x"], "pothole.jpg", { type: "image/jpeg" })] } });
  await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByText("place pin"));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("radio", { name: "Roads" }));
  await userEvent.type(screen.getByLabelText(/Description/), "Deep pothole near the bus stop");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Check and send" });
}

describe("report flow", () => {
  it("asks an unverified citizen to verify first", async () => {
    mockApi(base({ "GET /api/auth/me": () => json(200, { user: { ...citizen, emailVerified: false } }) }));
    renderApp("/citizen/report");
    expect(await screen.findByRole("heading", { name: "Verify your email to report" })).toBeInTheDocument();
  });

  it("photo → location → details → review → submit, with a clientRequestId, then the submitted screen", async () => {
    const fetch = mockApi(
      base({
        "POST /api/issues/duplicate-check": () => json(200, { checked: true, candidates: [] }),
        "POST /api/issues": () => json(201, { issue: createdIssue, duplicateRequest: false }),
      }),
    );
    const { router } = renderApp("/citizen/report");
    await fillReport();
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/report/submitted/${ISSUE_ID}`));
    expect(await screen.findByText("Checking your photo")).toBeInTheDocument();

    const check = fetch.mock.calls.find(([u]) => u === "/api/issues/duplicate-check");
    expect(JSON.parse(check[1].body)).toEqual({ categoryKey: "ROADS", description: "Deep pothole near the bus stop", lat: 16.8524, lng: 74.5815 });
    const form = fetch.mock.calls.find(([u, i]) => u === "/api/issues" && i.method === "POST")[1].body;
    expect(form.get("clientRequestId")).toMatch(/^[0-9a-f-]{36}$/);
    expect(form.get("categoryKey")).toBe("ROADS");
    expect(form.get("lat")).toBe("16.8524");
    expect(form.get("capturedAt")).toBe(new Date(1760000000000).toISOString());
    expect(form.get("duplicateCandidateIds")).toBeNull();
    expect(form.get("deviceLat")).toBeNull(); // no "use my location": neutral
  });

  it("duplicate sheet: 'same problem' supports the existing report and sends nothing new", async () => {
    const fetch = mockApi(
      base({
        "POST /api/issues/duplicate-check": () =>
          json(200, { checked: true, candidates: [{ id: OTHER_ID, category: { key: "ROADS", name: "Roads" }, description: "Big pothole at the bus stop", status: "ACKNOWLEDGED", reportedAt: "2026-10-19T08:00:00Z", distanceM: 9, similarity: 0.86, supporters: 2 }] }),
        [`POST /api/issues/${OTHER_ID}/support`]: () => json(200, { issueId: OTHER_ID, supporting: true, alreadySupporting: false, supporters: 3 }),
      }),
    );
    const { router } = renderApp("/citizen/report");
    await fillReport();
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    const sheet = await screen.findByRole("dialog", { name: "Is this the same problem?" });
    expect(within(sheet).getByText("Big pothole at the bus stop")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, this is my problem" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/report/supported/${OTHER_ID}`));
    expect(await screen.findByText("3 people support it")).toBeInTheDocument();
    expect(JSON.parse(fetch.mock.calls.find(([u]) => u.endsWith("/support"))[1].body)).toEqual({ fromDuplicatePopup: true });
    expect(fetch.mock.calls.some(([u, i]) => u === "/api/issues" && i.method === "POST")).toBe(false);
  });

  it("duplicate sheet: 'mine is different' submits with the declined ids", async () => {
    const fetch = mockApi(
      base({
        "POST /api/issues/duplicate-check": () =>
          json(200, { checked: true, candidates: [{ id: OTHER_ID, category: { key: "ROADS", name: "Roads" }, description: "Pothole", status: "REPORTED", reportedAt: "2026-10-19T08:00:00Z", distanceM: 12, similarity: 0.81, supporters: 0 }] }),
        "POST /api/issues": () => json(201, { issue: createdIssue }),
      }),
    );
    const { router } = renderApp("/citizen/report");
    await fillReport();
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    await userEvent.click(await screen.findByRole("button", { name: "No, mine is different. Send my report" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/report/submitted/${ISSUE_ID}`));
    const form = fetch.mock.calls.find(([u, i]) => u === "/api/issues" && i.method === "POST")[1].body;
    expect(form.get("duplicateCandidateIds")).toBe(OTHER_ID);
  });

  it("a failed duplicate check never blocks the report", async () => {
    mockApi(
      base({
        "POST /api/issues/duplicate-check": () => json(500, { error: { code: "INTERNAL_ERROR" } }),
        "POST /api/issues": () => json(201, { issue: createdIssue }),
      }),
    );
    const { router } = renderApp("/citizen/report");
    await fillReport();
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/report/submitted/${ISSUE_ID}`));
  });

  it("connection lost: shows 'retrying' and retries with the same clientRequestId", async () => {
    let calls = 0;
    const fetch = mockApi(
      base({
        "POST /api/issues/duplicate-check": () => json(200, { checked: false, candidates: [] }),
        "POST /api/issues": () => {
          calls += 1;
          if (calls === 1) throw new TypeError("Failed to fetch");
          return json(200, { issue: createdIssue, duplicateRequest: true });
        },
      }),
    );
    const { router } = renderApp("/citizen/report");
    await fillReport();
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByRole("heading", { name: "Connection lost" })).toBeInTheDocument();
    expect(screen.getByText(/Trying again in \d+ s \(attempt 1\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try now" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/citizen/report/submitted/${ISSUE_ID}`));
    const ids = fetch.mock.calls.filter(([u, i]) => u === "/api/issues" && i.method === "POST").map(([, i]) => i.body.get("clientRequestId"));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("a pin outside the service area is answered on the location step", async () => {
    mockApi(
      base({
        "POST /api/issues/duplicate-check": () => json(200, { checked: true, candidates: [] }),
        "POST /api/issues": () => json(422, { error: { code: "OUTSIDE_SERVICE_AREA" } }),
      }),
    );
    renderApp("/citizen/report");
    await fillReport();
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("heading", { name: "Where is it?" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("outside the area NagarSetu covers");
  });
});
