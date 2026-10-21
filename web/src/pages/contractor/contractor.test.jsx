// Phase 7d: contractor app against a mocked API.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { contractor, json, mockApi, renderApp } from "../../test/utils.jsx";

vi.mock("../../components/citizen/PinMap.jsx", () => ({ default: () => <div>job map</div> }));
vi.mock("../../lib/image.js", async (orig) => ({
  ...(await orig()),
  preparePhoto: vi.fn(async () => ({ blob: new Blob(["jpeg"], { type: "image/jpeg" }), width: 1600, height: 1200, capturedAt: Date.parse("2026-10-21T08:55:00Z") })),
}));
vi.mock("../../lib/geolocation.js", () => ({ getDevicePosition: vi.fn(async () => ({ lat: 16.8525, lng: 74.5816, accuracyM: 9 })) }));
// jsdom has no real upload progress: send through fetch (so the mocked API sees it) and report 50 %.
vi.mock("../../api/upload.js", async () => {
  const { api } = await import("../../api/client.js");
  return {
    uploadForm: (path, form, { onProgress } = {}) => {
      onProgress?.(0.5);
      return api(path, { method: "POST", form });
    },
  };
});

const ID = "3f8a2c10-0000-4000-8000-000000000001";
const ID2 = "9b1d4e20-0000-4000-8000-000000000002";
const ID3 = "5c5c5c5c-0000-4000-8000-000000000003";
const DAY = 86_400_000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();
const job = (over = {}) => ({
  issueId: ID,
  status: "ACKNOWLEDGED",
  stage: "NEW",
  category: { key: "ROADS", name: "Roads" },
  description: "Deep pothole near the market gate",
  location: { lat: 16.8524, lng: 74.5815 },
  addressText: "Station Road, near the bus stand",
  areaName: "Ganpati Peth",
  photo: { id: "p1", url: "/api/photos/p1" },
  priority: "HIGH",
  department: { name: "Municipal Construction Department" },
  note: "Use hot-mix. Barricade the lane first.",
  assignedAt: "2026-10-20T08:00:00Z",
  startedAt: null,
  completedAt: null,
  deadline: { deadlineAt: inDays(3.5), effectiveDeadline: inDays(3.5), paused: false, pausedSeconds: 0 },
  submissions: [],
  ...over,
});
const base = (extra = {}) => ({
  "GET /api/auth/me": () => json(200, { user: contractor }),
  "GET /api/notifications": () => json(200, { items: [], unread: 0, total: 0, page: 1, pageSize: 50 }),
  "GET /api/contractor/issues": () => json(200, { items: [] }),
  ...extra,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  globalThis.URL.createObjectURL ??= () => "blob:preview";
  globalThis.URL.revokeObjectURL ??= () => {};
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("my jobs", () => {
  it("splits jobs into New / In progress / Submitted / Completed, with area, priority, department, countdown and rework label", async () => {
    const rework = job({ issueId: ID2, stage: "REWORK", status: "IN_PROGRESS", description: "Second pothole", deadline: { deadlineAt: inDays(-0.2), effectiveDeadline: inDays(-0.2), paused: false }, submissions: [{ id: "s1", status: "REJECTED", reviewReason: "Edges not sealed", submittedAt: "2026-10-20T10:00:00Z" }] });
    const waiting = job({ issueId: ID3, stage: "SUBMITTED", status: "IN_PROGRESS", description: "Third pothole", deadline: { deadlineAt: inDays(2), effectiveDeadline: inDays(2), paused: true } });
    const fetch = mockApi(
      base({
        "GET /api/contractor/issues": (_b, url) =>
          url.includes("state=completed")
            ? json(200, { items: [job({ issueId: "done-1", stage: "COMPLETED", status: "RESOLVED", description: "Fixed last week" })], page: 1, pageSize: 50, total: 1 })
            : json(200, { items: [job(), rework, waiting] }),
      }),
    );
    renderApp("/contractor");
    expect(await screen.findByRole("heading", { level: 1, name: "My jobs" })).toBeInTheDocument();
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getByRole("tab", { name: /^New/ })).toHaveAttribute("aria-selected", "true");

    const card = (await screen.findAllByRole("article"))[0];
    expect(within(card).getByText("Station Road, near the bus stand")).toBeInTheDocument();
    expect(within(card).getByText("High priority")).toBeInTheDocument();
    expect(within(card).getByText("Municipal Construction Department")).toBeInTheDocument();
    expect(within(card).getByText(/Due in 3 days/)).toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole("tab", { name: /In progress/ }));
    const reworkCard = await screen.findByRole("article");
    expect(within(reworkCard).getByText("Rework requested")).toBeInTheDocument();
    expect(within(reworkCard).getByText("Edges not sealed")).toBeInTheDocument();
    expect(within(reworkCard).getByText(/Overdue by 4 hours/)).toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole("tab", { name: /Submitted/ }));
    expect(await screen.findByText(/Deadline paused while your evidence is checked/)).toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole("tab", { name: /Completed/ }));
    expect(await screen.findByText("Fixed last week")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/api/contractor/issues?state=completed"))).toBe(true);
  });
});

describe("job detail", () => {
  it("shows the job and the department's note; Start work needs a confirmation; there is no resolve button", async () => {
    let current = job();
    const fetch = mockApi(
      base({
        [`GET /api/contractor/issues/${ID}`]: () => json(200, { job: current }),
        [`POST /api/contractor/issues/${ID}/start`]: () => {
          current = job({ stage: "IN_PROGRESS", status: "IN_PROGRESS", startedAt: "2026-10-21T08:00:00Z" });
          return json(200, { job: current });
        },
      }),
    );
    renderApp(`/contractor/jobs/${ID}`);
    expect(await screen.findByText("Deep pothole near the market gate")).toBeInTheDocument();
    expect(screen.getByText("Use hot-mix. Barricade the lane first.")).toBeInTheDocument();
    expect(screen.getByText("Assigned by Municipal Construction Department")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=16.8524,74.5815");
    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Submit repair evidence/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start work" }));
    const dialog = await screen.findByRole("dialog", { name: "Start work on this job?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Start work" }));
    await waitFor(() => expect(fetch.mock.calls.some(([u, init]) => u === `/api/contractor/issues/${ID}/start` && init.method === "POST")).toBe(true));
    expect(await screen.findByRole("link", { name: /Submit repair evidence/ })).toHaveAttribute("href", `/contractor/jobs/${ID}/evidence`);
    expect(screen.queryByRole("button", { name: "Start work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
  });

  it("another contractor's job (404) shows 'not available' and nothing else", async () => {
    mockApi(base({ [`GET /api/contractor/issues/${ID2}`]: () => json(404, { error: { code: "NOT_FOUND" } }) }));
    renderApp(`/contractor/jobs/${ID2}`);
    expect(await screen.findByText("This job isn't available")).toBeInTheDocument();
    expect(screen.getByText("It doesn't exist or isn't assigned to you any more.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start work" })).not.toBeInTheDocument();
  });
});

describe("submit evidence", () => {
  const started = () => job({ stage: "IN_PROGRESS", status: "IN_PROGRESS", startedAt: "2026-10-21T08:00:00Z" });

  it("retries a lost upload with the same request ID, keeps capture time, camera source and GPS", async () => {
    const bodies = [];
    let calls = 0;
    const { router } = (() => {
      mockApi(
        base({
          [`GET /api/contractor/issues/${ID}`]: () => json(200, { job: started() }),
          [`POST /api/contractor/issues/${ID}/submissions`]: (form) => {
            bodies.push(Object.fromEntries([...form.entries()].filter(([k]) => k !== "photo")));
            calls += 1;
            if (calls === 1) throw new TypeError("Failed to fetch"); // connection lost
            return json(201, { job: job({ stage: "SUBMITTED", status: "IN_PROGRESS", submissions: [{ id: "s1", status: "SUBMITTED", submittedAt: "2026-10-21T09:00:00Z", captureSource: "CAMERA" }] }), duplicateRequest: false });
          },
        }),
      );
      return renderApp(`/contractor/jobs/${ID}/evidence`);
    })();

    const camera = await screen.findByTestId("evidence-camera");
    expect(camera).toHaveAttribute("capture", "environment");
    fireEvent.change(camera, { target: { files: [new File(["x"], "repair.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText(/Location added \(accuracy 9 m\)/)).toBeInTheDocument();
    expect(screen.getByText(/Taken with the camera/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Note/), "Patched and levelled");

    await userEvent.click(screen.getByRole("button", { name: "Send evidence" }));
    expect(await screen.findByText("Connection lost")).toBeInTheDocument();
    expect(screen.getByText(/can never send the evidence twice/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try now" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/contractor/jobs/${ID}/submissions`));
    expect(bodies).toHaveLength(2);
    expect(bodies[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[1]).toEqual(bodies[0]); // same request ID and fields on the retry
    expect(bodies[0]).toMatchObject({
      captureSource: "CAMERA",
      capturedAt: "2026-10-21T08:55:00.000Z",
      deviceLat: "16.8525",
      deviceLng: "74.5816",
      deviceAccuracyM: "9",
      note: "Patched and levelled",
    });
  });

  it("a gallery photo is allowed and marked GALLERY; the original photo can be laid over it", async () => {
    const bodies = [];
    mockApi(
      base({
        [`GET /api/contractor/issues/${ID}`]: () => json(200, { job: started() }),
        [`POST /api/contractor/issues/${ID}/submissions`]: (form) => {
          bodies.push(form.get("captureSource"));
          return json(201, { job: job({ stage: "SUBMITTED" }) });
        },
      }),
    );
    renderApp(`/contractor/jobs/${ID}/evidence`);
    fireEvent.change(await screen.findByTestId("evidence-gallery"), { target: { files: [new File(["x"], "old.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText(/From the gallery/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Show the citizen's photo over mine/ }));
    expect(screen.getByRole("slider", { name: /Overlay strength/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send evidence" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Send evidence" }));
    await waitFor(() => expect(bodies).toEqual(["GALLERY"]));
  });

  it("not before work has started", async () => {
    mockApi(base({ [`GET /api/contractor/issues/${ID}`]: () => json(200, { job: job() }) }));
    renderApp(`/contractor/jobs/${ID}/evidence`);
    expect(await screen.findByText("Start the work before sending evidence.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send evidence" })).not.toBeInTheDocument();
  });
});

describe("evidence status", () => {
  it("rework: shows the admin's reason, history and 'Submit new evidence'", async () => {
    mockApi(
      base({
        [`GET /api/contractor/issues/${ID}`]: () =>
          json(200, {
            job: job({
              stage: "REWORK",
              status: "IN_PROGRESS",
              submissions: [
                { id: "s1", status: "REJECTED", reviewReason: "Hole still visible", submittedAt: "2026-10-19T09:00:00Z", captureSource: "GALLERY", photo: { url: "/api/photos/e1" } },
                { id: "s2", status: "REJECTED", reviewReason: "Edges not sealed", submittedAt: "2026-10-20T09:00:00Z", captureSource: "CAMERA", photo: { url: "/api/photos/e2" } },
              ],
            }),
          }),
      }),
    );
    renderApp(`/contractor/jobs/${ID}/submissions`);
    expect(await screen.findByRole("heading", { level: 1, name: "Evidence status" })).toBeInTheDocument();
    expect(screen.getByText("Department's reason")).toBeInTheDocument();
    expect(screen.getAllByText("Edges not sealed").length).toBeGreaterThan(0);
    expect(screen.getByText("Reason: Hole still visible")).toBeInTheDocument();
    expect(screen.getByText("Attempt 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Submit new evidence" })).toHaveAttribute("href", `/contractor/jobs/${ID}/evidence`);
  });
});

describe("alerts, profile and blocked accounts", () => {
  it("contractor alerts use contractor wording and open the job", async () => {
    mockApi(
      base({
        "GET /api/notifications": () =>
          json(200, { items: [{ id: "n1", type: "RESOLVED", issueId: ID, params: { audience: "CONTRACTOR" }, readAt: "2026-10-21T08:00:00Z", createdAt: "2026-10-21T07:00:00Z" }], unread: 0, total: 1, page: 1, pageSize: 50 }),
        [`GET /api/contractor/issues/${ID}`]: () => json(200, { job: job({ stage: "COMPLETED", status: "RESOLVED" }) }),
      }),
    );
    const { router } = renderApp("/contractor/notifications");
    await userEvent.click(await screen.findByRole("button", { name: /Your repair was approved/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/contractor/jobs/${ID}`));
  });

  it("profile shows the contractor's details and the language switch", async () => {
    mockApi(base({ "GET /api/contractor/me": () => json(200, { contractor: { name: "Kulkarni Infra", email: "k@example.com", phone: "+91 98220 00000", workType: "roads", licenceNumber: "LIC-1", activeJobs: 2, completedJobs: 5 } }) }));
    renderApp("/contractor/profile");
    expect(await screen.findByText("+91 98220 00000")).toBeInTheDocument();
    expect(screen.getByText("LIC-1")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(screen.queryByText(/SMS|WhatsApp/)).not.toBeInTheDocument();
  });

  it("a deactivated contractor sees the blocked message at login", async () => {
    mockApi({
      "GET /api/auth/me": () => json(401, { error: { code: "NOT_AUTHENTICATED" } }),
      "POST /api/auth/login": () => json(403, { error: { code: "ACCOUNT_DEACTIVATED" } }),
    });
    const { router } = renderApp("/login");
    await userEvent.type(await screen.findByLabelText(/Email/), "k@example.com");
    await userEvent.type(screen.getByLabelText(/Password/), "Correct-Horse-9");
    await userEvent.click(screen.getByRole("button", { name: /Log in/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/account-blocked"));
  });
});
