// Phase 7c: admin screens against a mocked API (the server is tested separately).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { admin, citizen, json, mockApi, renderApp } from "../../test/utils.jsx";

vi.mock("../../components/admin/AdminMap.jsx", () => ({ default: ({ device }) => <div>{device ? "map with device" : "map with pin"}</div> }));

const ID = "3f8a2c10-0000-4000-8000-000000000001";
const ID2 = "9b1d4e20-0000-4000-8000-000000000002";
const SUB = "5c5c5c5c-0000-4000-8000-000000000005";
const K1 = "7a7a7a7a-0000-4000-8000-000000000007";
const DEPT = { id: "d1", code: "CONSTRUCTION", name: "Municipal Construction Department" };
const DASH = { department: DEPT, newLast24h: 2, waitingForReview: 5, inProgress: 3, escalated: 1, repairsToReview: 1, disputed: 2, needsReassignment: 0, needsPriority: 0, needsAssignment: 0 };
const community = { upvotes: 12, supporters: 3, accounts: 10, newAccounts: 6, newAccountDays: 7, lowDiversity: true };
const page = (items, extra = {}) => json(200, { items, page: 1, pageSize: 25, total: items.length, ...extra });

const row = (over = {}) => ({
  id: ID,
  status: "IN_PROGRESS",
  category: { key: "ROADS", name: "Roads" },
  description: "Deep pothole near the market gate",
  addressText: "Station Road",
  areaName: null,
  photo: { id: "p1", url: "/api/photos/p1" },
  createdAt: "2026-10-18T08:00:00Z",
  ai: { verdict: "VALID", riskLevel: "HIGH" },
  priority: "MEDIUM",
  community,
  flags: [{ id: "f1", type: "ESCALATED", confirmed: false }],
  assignment: { contractor: { id: K1, name: "Kulkarni Infra", status: "ACTIVE" }, deadline: { deadlineAt: "2026-10-01T00:00:00Z", effectiveDeadline: "2026-10-01T00:00:00Z", paused: false, pausedSeconds: 0 }, overdue: true },
  repairToReview: false,
  ...over,
});

const reviewIssue = (over = {}) => ({
  id: ID,
  status: "REPORTED",
  statusReason: null,
  rejectionType: null,
  category: { key: "ROADS", name: "Roads" },
  description: "रस्त्यावर मोठा खड्डा, road pe gaddha hai",
  location: { lat: 16.8524, lng: 74.5815 },
  addressText: "Station Road",
  photo: { id: "p1", url: "/api/photos/p1" },
  photoOriginalUrl: "/api/photos/p1?variant=original",
  createdAt: "2026-10-18T08:00:00Z",
  priority: null,
  reporter: { id: "c1", name: "Asha Patil" },
  device: { lat: 16.853, lng: 74.582, accuracyM: 12, distanceFromPinM: 80 },
  ai: { verdict: "VALID", reason: "Pothole clearly visible", riskLevel: "HIGH", riskReason: "Busy road", suggestedCategory: "ROADS", attempts: 1 },
  flags: [{ id: "f1", type: "SUSPICIOUS", reason: "GPS 800 m from pin", createdAt: "2026-10-18T08:00:00Z", confirmed: null }],
  community,
  assignment: null,
  pastAssignments: [],
  submissions: [],
  suggestedDeadline: "2026-10-25T08:00:00Z",
  feedback: { current: null, responses: [] },
  possibleDuplicates: [{ id: ID2, status: "ACKNOWLEDGED", category: "ROADS", description: "Same pothole", createdAt: "2026-10-17T08:00:00Z", distanceM: 9 }],
  duplicateOf: null,
  linkedDuplicates: [],
  history: [{ action: "ISSUE_CREATED", by: { id: "c1", name: "Asha Patil", role: "CITIZEN" }, reason: null, details: {}, at: "2026-10-18T08:00:00Z" }],
  ...over,
});

const base = (extra = {}, user = admin) => ({
  "GET /api/auth/me": () => json(200, { user }),
  "GET /api/notifications": () => json(200, { items: [], unread: 0, total: 0, page: 1, pageSize: 50 }),
  "GET /api/admin/dashboard": () => json(200, DASH),
  "GET /api/categories": () => json(200, { categories: [{ key: "ROADS", name: "Roads", department: DEPT }, { key: "GARBAGE", name: "Garbage", department: { name: "Solid Waste" } }] }),
  [`GET /api/admin/issues/${ID}/comments`]: () => page([]),
  ...extra,
});

/** Last request body sent to a path. */
const sent = (fetch, method, path) => {
  const call = [...fetch.mock.calls].reverse().find(([u, init]) => String(u).split("?")[0] === path && (init?.method ?? "GET") === method);
  return call && call[1].body ? JSON.parse(call[1].body) : call ? {} : undefined;
};

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin layout and dashboard", () => {
  it("shows the sidebar, department name and the six counts; citizens can't open it", async () => {
    mockApi(base({ "GET /api/admin/issues": () => page([]), "GET /api/admin/submissions": () => page([]) }));
    renderApp("/admin");
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Admin sections" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent.replace(/\d+.*$/, "").trim())).toEqual(["Dashboard", "Issues", "Disputes", "Contractors", "Comments", "Audit log"]);
    expect((await screen.findAllByText(DEPT.name)).length).toBeGreaterThan(0);
    for (const label of ["New (24 h)", "Awaiting review", "In progress", "Escalated", "Evidence to verify", "Disputed"]) {
      expect(screen.getByRole("link", { name: new RegExp(label.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Awaiting review/ })).toHaveTextContent("5");
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
  });

  it("a citizen opening /admin goes back to their own area", async () => {
    mockApi(base({ "GET /api/feed": () => page([]) }, citizen));
    const { router } = renderApp("/admin/issues");
    await waitFor(() => expect(router.state.location.pathname).toBe("/citizen"));
  });
});

describe("issues table", () => {
  it("shows AI risk labelled AI, community signal with new-account share, assignee and an overdue deadline; filters go to the server", async () => {
    const fetch = mockApi(base({ "GET /api/admin/issues": () => page([row()]) }));
    renderApp("/admin/issues");
    const table = await screen.findByRole("table");
    const r = within(table).getAllByRole("row")[1];
    expect(within(r).getByText("AI · High")).toBeInTheDocument();
    expect(within(r).getByText(/12 upvotes · 10 distinct supporters/)).toBeInTheDocument();
    expect(within(r).getByText(/60% accounts newer than 7 days/)).toBeInTheDocument();
    expect(within(r).getByText("Kulkarni Infra")).toBeInTheDocument();
    expect(within(r).getByText("· overdue")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Flag"), { target: { value: "ESCALATED" } });
    await userEvent.type(screen.getByLabelText("Search"), "#3F8A2C10");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      const urls = fetch.mock.calls.map(([u]) => decodeURIComponent(String(u)));
      expect(urls.some((u) => u.includes("/api/admin/issues?") && u.includes("flag=ESCALATED") && u.includes("q=#3F8A2C10"))).toBe(true);
    });
  });
});

describe("issue review", () => {
  it("shows the photo, description as written, map with device GPS, AI suggestion labelled; accept needs a reason when the priority differs from the AI", async () => {
    let issue = reviewIssue();
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue }),
        [`POST /api/admin/issues/${ID}/accept`]: () => {
          issue = reviewIssue({ status: "ACKNOWLEDGED", priority: "LOW" });
          return json(200, { issue });
        },
      }),
    );
    renderApp(`/admin/issues/${ID}`);
    expect(await screen.findByText("रस्त्यावर मोठा खड्डा, road pe gaddha hai")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the original photo/ })).toHaveAttribute("href", "/api/photos/p1?variant=original");
    expect(await screen.findByText("map with device")).toBeInTheDocument();
    expect(screen.getByText(/80 m between them/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI suggestion" })).toBeInTheDocument();
    expect(screen.getByText(/The AI can be wrong/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    const dialog = await screen.findByRole("dialog", { name: "Accept this report?" });
    fireEvent.change(within(dialog).getByLabelText(/Final priority/), { target: { value: "LOW" } });
    const confirm = within(dialog).getByRole("button", { name: "Accept" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Why this priority/), "Quiet lane, low traffic");
    await userEvent.click(confirm);
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/issues/${ID}/accept`)).toEqual({ priority: "LOW", priorityReason: "Quiet lane, low traffic" }));
    expect(await screen.findByRole("button", { name: "Assign contractor" })).toBeInTheDocument();
  });

  it("reject asks for a type and a reason for the citizen", async () => {
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: reviewIssue() }),
        [`POST /api/admin/issues/${ID}/reject`]: () => json(200, { issue: reviewIssue({ status: "REJECTED", statusReason: "Private compound" }) }),
      }),
    );
    renderApp(`/admin/issues/${ID}`);
    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog", { name: "Reject this report?" });
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Reason \(shown to the citizen\)/), "Private compound");
    await userEvent.click(confirm);
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/issues/${ID}/reject`)).toEqual({ type: "NOT_VALID", reason: "Private compound" }));
    expect(await screen.findByText("This report was rejected. The citizen was told why.")).toBeInTheDocument();
  });

  it("clears a flag with a reason, and links a possible duplicate after confirming", async () => {
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: reviewIssue() }),
        [`POST /api/admin/issues/${ID}/flags/f1/clear`]: () => json(200, { issue: reviewIssue({ flags: [] }) }),
        [`POST /api/admin/issues/${ID}/link-duplicate`]: () => json(200, { issue: reviewIssue({ status: "DUPLICATE" }) }),
      }),
    );
    renderApp(`/admin/issues/${ID}`);
    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));
    let dialog = await screen.findByRole("dialog", { name: /Clear "Suspicious"/i });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Pin moved by the citizen, photo matches");
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/issues/${ID}/flags/f1/clear`)).toEqual({ reason: "Pin moved by the citizen, photo matches" }));

    await userEvent.click(await screen.findByRole("button", { name: "Link this" }));
    dialog = await screen.findByRole("dialog", { name: "Link as a duplicate?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Link as duplicate" }));
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/issues/${ID}/link-duplicate`)).toEqual({ targetIssueId: ID2 }));
  });

  it("assigns a contractor with a deadline", async () => {
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: reviewIssue({ status: "ACKNOWLEDGED", priority: "HIGH" }) }),
        "GET /api/admin/contractors": () => json(200, { contractors: [{ id: K1, name: "Kulkarni Infra", workType: "roads", activeJobs: 2, invitePending: false, status: "ACTIVE" }] }),
        [`POST /api/admin/issues/${ID}/assign`]: () => json(200, { issue: reviewIssue({ status: "ACKNOWLEDGED", priority: "HIGH" }) }),
      }),
    );
    renderApp(`/admin/issues/${ID}`);
    await userEvent.click(await screen.findByRole("button", { name: "Assign contractor" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign a contractor?" });
    await within(dialog).findByRole("option", { name: /Kulkarni Infra · roads · 2 active jobs/ });
    fireEvent.change(within(dialog).getByLabelText(/^Contractor/), { target: { value: K1 } });
    fireEvent.change(within(dialog).getByLabelText(/^Deadline/), { target: { value: "2026-10-30" } });
    await userEvent.type(within(dialog).getByLabelText(/Instructions for the contractor/), "Barricade the lane first");
    await userEvent.click(within(dialog).getByRole("button", { name: "Assign contractor" }));
    await waitFor(() => {
      const body = sent(fetch, "POST", `/api/admin/issues/${ID}/assign`);
      expect(body.contractorId).toBe(K1);
      expect(body.note).toBe("Barricade the lane first");
      expect(new Date(body.deadlineAt).getDate()).toBe(30);
    });
  });

  it("posts an official reply after confirming, and hides a comment with a reason", async () => {
    const comments = [{ id: "c1", issueId: ID, body: "abusive words", createdAt: "2026-10-19T08:00:00Z", official: false, author: { id: "u9", name: "Troll Name", role: "CITIZEN", status: "ACTIVE" }, hidden: null, reports: { total: 2, byReason: { ABUSIVE: 2 }, notes: [] } }];
    const fetch = mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: reviewIssue() }),
        [`GET /api/admin/issues/${ID}/comments`]: () => page(comments),
        [`POST /api/admin/issues/${ID}/replies`]: () => json(201, { comment: {} }),
        "POST /api/admin/comments/c1/hide": () => json(200, { comment: {} }),
      }),
    );
    renderApp(`/admin/issues/${ID}`);
    await userEvent.type(await screen.findByLabelText("Official reply"), "Inspection on Friday");
    await userEvent.click(screen.getByRole("button", { name: "Post official reply" }));
    let dialog = await screen.findByRole("dialog", { name: "Post this official reply?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Post official reply" }));
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/issues/${ID}/replies`)).toEqual({ body: "Inspection on Friday" }));

    expect(await screen.findByText(/2 reports · Abusive or hateful \(2\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    dialog = await screen.findByRole("dialog", { name: "Hide this comment?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Abusive language");
    await userEvent.click(within(dialog).getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(sent(fetch, "POST", "/api/admin/comments/c1/hide")).toEqual({ reason: "Abusive language" }));
  });
});

describe("repair evidence review", () => {
  const withSub = () =>
    reviewIssue({
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignment: { id: "a1", contractor: { id: K1, name: "Kulkarni Infra", status: "ACTIVE" }, deadline: { deadlineAt: "2026-10-30T00:00:00Z", effectiveDeadline: "2026-10-30T00:00:00Z", paused: true }, startedAt: "2026-10-19T08:00:00Z" },
      submissions: [
        { id: "s0", status: "REJECTED", contractorId: K1, submittedAt: "2026-10-19T09:00:00Z", capturedAt: null, device: {}, photo: { id: "e0", url: "/api/photos/e0" }, ai: {}, review: { reason: "Hole still visible" } },
        { id: SUB, status: "SUBMITTED", contractorId: K1, submittedAt: "2026-10-20T09:00:00Z", capturedAt: "2026-10-20T08:55:00Z", note: "Patched", captureSource: "GALLERY", device: { lat: 16.8525, lng: 74.5816, accuracyM: 8, distanceFromIssueM: 14 }, photo: { id: "e1", url: "/api/photos/e1", originalUrl: "/api/photos/e1?variant=original" }, ai: { verdict: "VALID", reason: "Surface looks level" }, review: null },
      ],
    });

  it("shows both photos, the distance, the AI verdict and history; approve after confirming", async () => {
    const fetch = mockApi(base({ [`GET /api/issues/${ID}`]: () => json(200, { issue: withSub() }), [`POST /api/admin/submissions/${SUB}/approve`]: () => json(200, { issue: withSub() }) }));
    renderApp(`/admin/issues/${ID}/repair`);
    expect(await screen.findByText(/14 m from the issue \(phone accuracy 8 m\)/)).toBeInTheDocument();
    expect(screen.getByText("Surface looks level")).toBeInTheDocument();
    expect(screen.getAllByText("Uploaded from the gallery").length).toBeGreaterThan(0); // a signal, not a rejection
    expect(screen.getByText("Your reason: Hole still visible")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Repair evidence" })).toHaveAttribute("src", "/api/photos/e1");
    await userEvent.click(screen.getByRole("button", { name: "Approve → Resolved" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve this repair?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve → Resolved" }));
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/submissions/${SUB}/approve`)).toEqual({}));
  });

  it("reject needs a reason for the contractor", async () => {
    const fetch = mockApi(base({ [`GET /api/issues/${ID}`]: () => json(200, { issue: withSub() }), [`POST /api/admin/submissions/${SUB}/reject`]: () => json(200, { issue: withSub() }) }));
    renderApp(`/admin/issues/${ID}/repair`);
    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask for rework?" });
    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/What needs to be redone/), "Edges not sealed");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/submissions/${SUB}/reject`)).toEqual({ reason: "Edges not sealed" }));
  });
});

describe("disputes queue", () => {
  it("shows the citizens' reasons and reopens with a reason", async () => {
    const d = {
      id: ID, status: "RESOLVED", category: { key: "ROADS", name: "Roads" }, description: "Pothole", areaName: "Khanbhag", createdAt: "2026-10-10T08:00:00Z",
      resolvedAt: "2026-10-18T08:00:00Z", disputedAt: "2026-10-19T08:00:00Z", before: { url: "/api/photos/p1" }, after: { url: "/api/photos/e1" },
      counts: { fixed: 1, notFixed: 1, noResponse: 2 },
      notFixed: [{ id: "fb1", by: { id: "c1", name: "Asha Patil" }, verdict: "NOT_FIXED", reason: "Water still collects here", photo: null, at: "2026-10-19T08:00:00Z" }],
    };
    const fetch = mockApi(base({ "GET /api/admin/disputes": () => page([d]), [`POST /api/admin/issues/${ID}/reopen`]: () => json(200, { issue: {} }) }));
    renderApp("/admin/disputes");
    expect(await screen.findByText("Water still collects here")).toBeInTheDocument();
    expect(screen.getByText("Fixed: 1 · Not fixed: 1 · No response: 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));
    const dialog = await screen.findByRole("dialog", { name: "Reopen this issue?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Drain cover missing");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/issues/${ID}/reopen`)).toEqual({ reason: "Drain cover missing" }));
  });
});

describe("contractors", () => {
  it("invite: similar-contractor warning first, then create anyway and the one-time link", async () => {
    let calls = 0;
    const fetch = mockApi(
      base({
        "GET /api/admin/contractors": () => json(200, { contractors: [] }),
        "POST /api/admin/contractors": (body) => {
          calls += 1;
          if (!body.confirmSimilar) {
            return json(409, { error: { code: "SIMILAR_CONTRACTORS", details: { similar: [{ id: K1, name: "Kulkarni Infra Pvt", phone: "+91 98220 00000", licenceNumber: null, matchedOn: ["PHONE", "NAME"] }] } } });
          }
          return json(201, { contractor: { id: "k2" }, inviteUrl: "http://localhost:5173/invite/abc", inviteExpiresAt: "2026-10-23T08:00:00Z" });
        },
      }),
    );
    renderApp("/admin/contractors");
    await userEvent.click(await screen.findByRole("button", { name: "Invite contractor" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a contractor" });
    await userEvent.type(within(dialog).getByLabelText(/Name or company/), "Kulkarni Infra");
    await userEvent.type(within(dialog).getByLabelText(/^Phone/), "+91 98220 00000");
    await userEvent.type(within(dialog).getByLabelText(/^Email/), "k@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create and get link" }));
    expect(await within(dialog).findByText("Similar contractors already exist")).toBeInTheDocument();
    expect(within(dialog).getByText(/same phone, name/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create anyway" }));
    expect(await within(dialog).findByDisplayValue("http://localhost:5173/invite/abc")).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(sent(fetch, "POST", "/api/admin/contractors")).toMatchObject({ name: "Kulkarni Infra", confirmSimilar: true });
  });

  it("deactivate shows the active jobs to reassign and needs a reason", async () => {
    const fetch = mockApi(
      base({
        "GET /api/admin/contractors": () => json(200, { contractors: [{ id: K1, name: "Kulkarni Infra", phone: "+91 98220 00000", email: "k@example.com", workType: "roads", activeJobs: 2, invitePending: false, status: "ACTIVE" }] }),
        [`GET /api/admin/contractors/${K1}/jobs`]: () =>
          json(200, {
            contractorId: K1,
            jobs: [{ assignmentId: "a1", issue: { id: ID, description: "Pothole on MG Road" }, deadline: { effectiveDeadline: "2026-10-30T00:00:00Z", paused: false }, overdue: false }],
            otherDepartmentsJobs: 1,
          }),
        [`POST /api/admin/contractors/${K1}/deactivate`]: () => json(200, { contractor: {} }),
      }),
    );
    renderApp("/admin/contractors");
    await userEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("dialog", { name: "Deactivate Kulkarni Infra?" });
    expect(await within(dialog).findByText("Pothole on MG Road")).toBeInTheDocument();
    expect(within(dialog).getByText(/Plus 1 job in another department/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Licence expired");
    await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(sent(fetch, "POST", `/api/admin/contractors/${K1}/deactivate`)).toEqual({ reason: "Licence expired" }));
  });
});

describe("comment moderation", () => {
  it("lists reported comments and suspends the author with a reason; suspended accounts can be reactivated", async () => {
    const c = { id: "c1", issueId: ID, body: "spam link", createdAt: "2026-10-19T08:00:00Z", official: false, author: { id: "u9", name: "Troll Name", role: "CITIZEN", status: "ACTIVE" }, hidden: null, reports: { total: 1, byReason: { SPAM: 1 }, notes: [{ reason: "SPAM", note: "advert", at: "2026-10-19T09:00:00Z" }] }, issue: { id: ID, category: { key: "ROADS", name: "Roads" }, description: "Pothole" } };
    const fetch = mockApi(
      base({
        "GET /api/admin/comments": () => page([c]),
        "POST /api/admin/citizens/u9/suspend": () => json(200, { citizen: {} }),
        "GET /api/admin/citizens/suspended": () => page([{ id: "u9", name: "Troll Name", status: "DEACTIVATED", deactivatedAt: "2026-10-20T08:00:00Z", reason: "Spam", by: { id: "a1", name: "Roads Admin" } }]),
        "POST /api/admin/citizens/u9/reactivate": () => json(200, { citizen: {} }),
      }),
    );
    renderApp("/admin/comments");
    expect(await screen.findByText("spam link")).toBeInTheDocument();
    expect(screen.getByText("“advert” — Spam or advertising")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Suspend author" }));
    let dialog = await screen.findByRole("dialog", { name: "Suspend Troll Name?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Repeated spam");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suspend author" }));
    await waitFor(() => expect(sent(fetch, "POST", "/api/admin/citizens/u9/suspend")).toEqual({ reason: "Repeated spam" }));

    await userEvent.click(screen.getByRole("tab", { name: "Suspended accounts" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reactivate" }));
    dialog = await screen.findByRole("dialog", { name: "Reactivate Troll Name?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "Apologised");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(sent(fetch, "POST", "/api/admin/citizens/u9/reactivate")).toEqual({ reason: "Apologised" }));
  });
});

describe("audit log", () => {
  it("is read-only and sends the filters", async () => {
    const fetch = mockApi(
      base({
        "GET /api/admin/audit-log": () =>
          json(200, {
            items: [{ id: "1", at: "2026-10-20T08:00:00Z", action: "ISSUE_STATUS_CHANGED", actor: { id: "a1", name: "Roads Admin", role: "ADMIN" }, target: { type: "ISSUE", id: ID }, issueId: ID, reason: "Private compound", details: { from: "REPORTED", to: "REJECTED" } }],
            page: 1,
            pageSize: 50,
            total: 1,
          }),
      }),
    );
    renderApp("/admin/audit");
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Status changed")).toBeInTheDocument();
    expect(within(table).getByText("Reported → Rejected")).toBeInTheDocument();
    expect(within(table).getByText("Private compound")).toBeInTheDocument();
    expect(within(table).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "COMMENT_HIDDEN" } });
    fireEvent.change(screen.getByLabelText("Who"), { target: { value: "ME" } });
    await waitFor(() => {
      const urls = fetch.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes("/api/admin/audit-log?") && u.includes("action=COMMENT_HIDDEN") && u.includes("actor=ME"))).toBe(true);
    });
  });
});
