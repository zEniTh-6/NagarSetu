// Phase 7b: feed, upvotes, public issue view with comments, public map (D-022, D-025).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { citizen, json, mockApi, renderApp } from "../../test/utils.jsx";
import { groupPins, roundBbox } from "../../lib/pins.js";

vi.mock("../../components/citizen/PinMap.jsx", () => ({ default: ({ area }) => <div>{area ? `area map ${area.radiusM} m` : "map preview"}</div> }));
// jsdom can't render Leaflet: a stand-in that reports a box and lets the test tap a pin group.
vi.mock("../../components/citizen/PublicMap.jsx", async () => {
  const { useEffect } = await import("react");
  return {
    default: ({ pins, onBounds, onSelect }) => {
      useEffect(() => onBounds("74.51234,16.80001,74.69999,16.89999"), [onBounds]);
      return (
        <div>
          <p>{pins.length} pins</p>
          <button type="button" onClick={() => onSelect(pins.map((p) => p.id))}>
            tap pins
          </button>
        </div>
      );
    },
  };
});

const ID = "3f8a2c10-0000-4000-8000-000000000001";
const ID2 = "9b1d4e20-0000-4000-8000-000000000002";
const CATEGORIES = {
  categories: [
    { key: "ROADS", name: "Roads" },
    { key: "GARBAGE", name: "Garbage" },
    { key: "STREETLIGHT", name: "Streetlight" },
  ],
};
const card = (over = {}) => ({
  id: ID,
  visibility: "PUBLIC",
  status: "ACKNOWLEDGED",
  category: { key: "ROADS", name: "Roads" },
  description: "Deep pothole near the market gate",
  areaName: "Ganpati Peth",
  approxLocation: { lat: 16.852, lng: 74.582, radiusM: 150 },
  photo: { id: "p1", url: "/api/photos/p1" },
  createdAt: "2026-10-18T08:00:00Z",
  community: { upvotes: 4, supporters: 1, comments: 2 },
  viewer: { upvoted: false, relation: null },
  latestOfficialReply: null,
  ...over,
});
const page = (items, extra = {}) => json(200, { items, page: 1, pageSize: 20, total: items.length, ...extra });
const base = (extra = {}, user = citizen) => ({
  "GET /api/auth/me": () => json(200, { user }),
  "GET /api/notifications": () => json(200, { items: [], unread: 0, total: 0, page: 1, pageSize: 50 }),
  "GET /api/categories": () => json(200, CATEGORIES),
  ...extra,
});

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("home feed", () => {
  it("shows public cards: area or 'Approximate location', official reply highlighted, counts; no exact location", async () => {
    mockApi(
      base({
        "GET /api/feed": () =>
          page([
            card({
              latestOfficialReply: { id: "c9", body: "Contractor assigned, expected by 20 Oct", official: true, author: { department: "Municipal Construction Department" }, createdAt: "2026-10-19T08:00:00Z" },
            }),
            card({ id: ID2, areaName: null, community: { upvotes: 0, supporters: 0, comments: 0 }, description: "Overflowing bin" }),
          ]),
      }),
    );
    renderApp("/citizen");
    expect(await screen.findByRole("heading", { level: 1, name: "Community feed" })).toBeInTheDocument();
    const [first, second] = await screen.findAllByRole("article");
    expect(within(first).getByText("Ganpati Peth")).toBeInTheDocument();
    expect(within(first).getByText("Official reply")).toBeInTheDocument();
    expect(within(first).getByText("Municipal Construction Department")).toBeInTheDocument();
    expect(within(first).getByText("Contractor assigned, expected by 20 Oct")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: /4 upvotes/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(first).getByRole("link", { name: "2 comments" })).toHaveAttribute("href", `/citizen/issues/${ID}#comments`);
    expect(within(second).getByText("Approximate location")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/16\.85|74\.58/);
  });

  it("filters by category with a selected chip, and loads more", async () => {
    const fetch = mockApi(
      base({
        "GET /api/feed": (_b, url) =>
          url.includes("category=GARBAGE")
            ? page([card({ id: ID2, category: { key: "GARBAGE", name: "Garbage" }, description: "Overflowing bin" })])
            : url.includes("page=2")
              ? json(200, { items: [card({ id: ID2, description: "Older pothole" })], page: 2, pageSize: 20, total: 21 })
              : json(200, { items: [card()], page: 1, pageSize: 20, total: 21 }),
      }),
    );
    renderApp("/citizen");
    await screen.findByText("Deep pothole near the market gate");
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Older pothole")).toBeInTheDocument();

    const chips = screen.getByRole("group", { name: "Filter by category" });
    expect(within(chips).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(chips).getByRole("button", { name: "Garbage" }));
    expect(await screen.findByText("Overflowing bin")).toBeInTheDocument();
    const garbage = within(chips).getByRole("button", { name: "Garbage" });
    expect(garbage).toHaveAttribute("aria-pressed", "true");
    expect(garbage.className).toContain("border-teal-700");
    expect(within(chips).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/api/feed?category=GARBAGE"))).toBe(true);
  });

  it("upvote toggles: POST then DELETE, with the server's count", async () => {
    const fetch = mockApi(
      base({
        "GET /api/feed": () => page([card()]),
        [`POST /api/issues/${ID}/upvote`]: () => json(200, { issueId: ID, upvoted: true, alreadyUpvoted: false, upvotes: 5 }),
        [`DELETE /api/issues/${ID}/upvote`]: () => json(200, { issueId: ID, upvoted: false, upvotes: 4 }),
      }),
    );
    renderApp("/citizen");
    const button = await screen.findByRole("button", { name: /4 upvotes/ });
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: /5 upvotes/ })).toHaveAttribute("aria-pressed", "true"));
    await userEvent.click(screen.getByRole("button", { name: /5 upvotes/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /4 upvotes/ })).toHaveAttribute("aria-pressed", "false"));
    const methods = fetch.mock.calls.filter(([u]) => String(u).endsWith("/upvote")).map(([, init]) => init.method);
    expect(methods).toEqual(["POST", "DELETE"]);
  });

  it("can't upvote your own report or before verifying the email", async () => {
    mockApi(base({ "GET /api/feed": () => page([card({ viewer: { upvoted: false, relation: "REPORTER" } })]) }));
    renderApp("/citizen");
    expect(await screen.findByRole("button", { name: /4 upvotes.*can't upvote your own report/ })).toBeDisabled();
  });

  it("unverified citizens see the verify banner and a disabled upvote", async () => {
    mockApi(base({ "GET /api/feed": () => page([card()]) }, { ...citizen, emailVerified: false }));
    renderApp("/citizen");
    expect(await screen.findByText("Verify your email")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /4 upvotes.*Verify your email/ })).toBeDisabled();
  });
});

describe("public issue view", () => {
  const comments = [
    { id: "c2", body: "Contractor assigned, expected by 20 Oct", official: true, author: { department: "Municipal Construction Department" }, mine: false, reportedByMe: false, createdAt: "2026-10-19T09:00:00Z" },
    { id: "c1", body: "Same here, my scooter slipped", official: false, author: { firstName: "Ravi" }, mine: false, reportedByMe: false, createdAt: "2026-10-19T08:00:00Z" },
  ];

  it("shows the approximate area, upvote/support, official reply highlight; posts a comment as written", async () => {
    const timeline = [
      { type: "REPORTED", at: "2026-10-18T08:00:00Z" },
      { type: "ACKNOWLEDGED", at: "2026-10-18T10:00:00Z" },
    ];
    const posted = [];
    mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: card({ timeline }) }),
        [`GET /api/issues/${ID}/comments`]: () => page(comments),
        [`POST /api/issues/${ID}/comments`]: (body) => {
          posted.push(body);
          return json(201, { comment: { id: "c3", body: body.body, official: false, author: { firstName: "Asha" }, mine: true, reportedByMe: false, createdAt: "2026-10-20T08:00:00Z" } });
        },
      }),
    );
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByText("Approximate area")).toBeInTheDocument();
    expect(await screen.findByText("area map 150 m")).toBeInTheDocument();
    expect(screen.getByText(/within about 150 m/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Support" })).toBeInTheDocument();
    expect(screen.queryByText(/Checking the photo/i)).not.toBeInTheDocument();

    const section = screen.getByRole("region", { name: /Comments/ });
    expect(await within(section).findByText("Same here, my scooter slipped")).toBeInTheDocument();
    expect(within(section).getByText("Ravi")).toBeInTheDocument();
    expect(within(section).getByText("Official reply")).toBeInTheDocument();
    // No report button on official replies.
    expect(within(section).getAllByRole("button", { name: "Report comment" })).toHaveLength(1);

    const text = "  रस्त्यावर खड्डा, road pe gaddha  ";
    await userEvent.type(within(section).getByLabelText("Your comment"), text);
    await userEvent.click(within(section).getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(posted).toEqual([{ body: text }]));
  });

  it("reports a comment with a reason from the sheet", async () => {
    const reports = [];
    mockApi(
      base({
        [`GET /api/issues/${ID}`]: () => json(200, { issue: card({ timeline: [] }) }),
        [`GET /api/issues/${ID}/comments`]: () => page(comments),
        "POST /api/comments/c1/report": (body) => {
          reports.push(body);
          return json(200, { commentId: "c1", reported: true, alreadyReported: false });
        },
      }),
    );
    renderApp(`/citizen/issues/${ID}`);
    await userEvent.click(await screen.findByRole("button", { name: "Report comment" }));
    const sheet = await screen.findByRole("dialog", { name: "Report this comment" });
    const send = within(sheet).getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    const abusive = within(sheet).getByRole("radio", { name: "Abusive or hateful" });
    await userEvent.click(abusive);
    expect(abusive).toHaveAttribute("aria-checked", "true");
    await userEvent.click(send);
    await waitFor(() => expect(reports).toEqual([{ reason: "ABUSIVE" }]));
  });

  it("the reporter's own report that isn't public yet: no upvote bar, comments not open", async () => {
    mockApi(
      base({
        [`GET /api/issues/${ID}`]: () =>
          json(200, {
            issue: {
              ...card({ visibility: "FOLLOWER", status: "REPORTED", approxLocation: undefined }),
              location: { lat: 16.8524, lng: 74.5815 },
              validation: { state: "UNDER_REVIEW" },
              timeline: [],
              relation: "REPORTER",
              public: false,
              viewer: { upvoted: false, relation: "REPORTER" },
            },
          }),
        [`GET /api/issues/${ID}/comments`]: () => page([]),
      }),
    );
    renderApp(`/citizen/issues/${ID}`);
    expect(await screen.findByText(/Only you, its supporters and the department can see this report/)).toBeInTheDocument();
    expect(screen.getByText("Comments open once the report is public.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upvote/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Your comment")).not.toBeInTheDocument();
  });
});

describe("public map", () => {
  it("asks for the visible box (rounded outwards), warns when capped, and opens a report from a pin", async () => {
    const fetch = mockApi(
      base({
        "GET /api/feed/map": () => json(200, { pins: [{ id: ID, lat: 16.852, lng: 74.582, category: "ROADS", status: "ACKNOWLEDGED" }], truncated: true }),
        [`GET /api/issues/${ID}`]: () => json(200, { issue: card({ timeline: [] }) }),
      }),
    );
    renderApp("/citizen/map");
    expect(await screen.findByText("1 pins")).toBeInTheDocument();
    const url = fetch.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith("/api/feed/map"));
    expect(decodeURIComponent(url)).toBe("/api/feed/map?bbox=74.5123,16.8000,74.7000,16.9000");
    expect(screen.getByText(/Showing the newest 1 reports in this view/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "tap pins" }));
    const sheet = await screen.findByRole("dialog", { name: "1 report in this area" });
    expect(await within(sheet).findByText("Deep pothole near the market gate")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "View details" })).toHaveAttribute("href", `/citizen/issues/${ID}`);
    expect(within(sheet).getByRole("button", { name: /4 upvotes/ })).toBeInTheDocument();
  });
});

describe("official reply alert", () => {
  it("shows the department and the reply as written", async () => {
    mockApi(
      base({
        "GET /api/notifications": () =>
          json(200, {
            items: [{ id: "n1", type: "OFFICIAL_REPLY", issueId: ID, params: { commentId: "c2", department: "Municipal Construction Department", excerpt: "Contractor assigned" }, readAt: null, createdAt: "2026-10-20T08:00:00Z" }],
            unread: 1,
            total: 1,
            page: 1,
            pageSize: 50,
          }),
      }),
    );
    renderApp("/citizen/notifications");
    expect(await screen.findByText("The department replied")).toBeInTheDocument();
    expect(screen.getByText("Municipal Construction Department: Contractor assigned")).toBeInTheDocument();
  });
});

describe("map helpers", () => {
  it("groups pins on the same point and keeps one category only when they all match", () => {
    const groups = groupPins([
      { id: "a", lat: 1, lng: 2, category: "ROADS" },
      { id: "b", lat: 1, lng: 2, category: "GARBAGE" },
      { id: "c", lat: 3, lng: 4, category: "ROADS" },
    ]);
    expect(groups).toEqual([
      { key: "1,2", lat: 1, lng: 2, ids: ["a", "b"], category: null },
      { key: "3,4", lat: 3, lng: 4, ids: ["c"], category: "ROADS" },
    ]);
  });

  it("rounds the box outwards and clamps a wrapped world", () => {
    expect(roundBbox("74.51234,16.80001,74.69999,16.89999")).toBe("74.5123,16.8000,74.7000,16.9000");
    expect(roundBbox("-200,-95,200,95")).toBe("-180.0000,-90.0000,180.0000,90.0000");
  });
});
