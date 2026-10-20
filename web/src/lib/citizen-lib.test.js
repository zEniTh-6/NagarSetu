import { afterEach, describe, expect, it, vi } from "vitest";
import { fitWithin, MAX_EDGE } from "./image.js";
import { MIN_INTERVAL_MS, resetNominatimThrottle, searchPlaces } from "./nominatim.js";
import { inServiceArea } from "./serviceArea.js";
import { reportForm } from "../api/citizen.js";
import { buildSteps } from "../components/citizen/IssueTimeline.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetNominatimThrottle();
});

describe("fitWithin (client-side resize)", () => {
  it("scales the long edge down to MAX_EDGE and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_EDGE, height: 1536 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1536, height: MAX_EDGE });
  });
  it("never upscales", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("Nominatim search", () => {
  it("asks only inside the service area and spaces requests at least 1 s apart", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response(JSON.stringify([{ display_name: "Rajwada Chowk, Sangli", lat: "16.85", lon: "74.58" }])));
    vi.stubGlobal("fetch", fetch);

    const first = searchPlaces("Rajwada", { lang: "mr" });
    const second = searchPlaces("Ganpati Peth");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    expect(await first).toEqual([{ label: "Rajwada Chowk, Sangli", lat: 16.85, lng: 74.58 }]);
    await second;
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("bounded")).toBe("1");
    expect(url.searchParams.get("viewbox")).toBe("74.518889,16.895833,74.680833,16.774444");
    expect(url.searchParams.get("accept-language")).toBe("mr");
  });

  it("does not call the service for very short queries", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await searchPlaces("ab")).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("service area", () => {
  it("matches the SMKC bounding box (D-012)", () => {
    expect(inServiceArea(16.8524, 74.5815)).toBe(true);
    expect(inServiceArea(18.52, 73.85)).toBe(false); // Pune
  });
});

describe("reportForm", () => {
  it("sends the fields the server expects and leaves out empty optional ones", () => {
    const photo = new Blob(["x"], { type: "image/jpeg" });
    const f = reportForm({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      photo,
      categoryKey: "ROADS",
      description: "रस्त्यावर मोठा खड्डा",
      lat: 16.85,
      lng: 74.58,
      addressText: "  ",
      device: { lat: 16.851, lng: 74.581, accuracyM: 12.4 },
      capturedAt: 1700000000000,
      duplicateCandidateIds: ["a", "b"],
    });
    expect(f.get("description")).toBe("रस्त्यावर मोठा खड्डा"); // stored as written
    expect(f.get("addressText")).toBeNull();
    expect(f.get("deviceAccuracyM")).toBe("12");
    expect(f.get("capturedAt")).toBe(new Date(1700000000000).toISOString());
    expect(f.get("duplicateCandidateIds")).toBe("a,b");
    expect(f.get("photo")).toBeInstanceOf(Blob);
    const bare = reportForm({ clientRequestId: "x", photo, categoryKey: "ROADS", description: "hello", lat: 1, lng: 2 });
    expect([...bare.keys()].sort()).toEqual(["categoryKey", "clientRequestId", "description", "lat", "lng", "photo"]);
  });
});

describe("timeline steps", () => {
  const t = (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k);
  const name = (c) => String(c?.key ?? c);

  it("marks the last event current and adds the remaining main steps for an active issue", () => {
    const steps = buildSteps(
      { status: "ACKNOWLEDGED", timeline: [{ type: "REPORTED", at: "2026-10-18T10:00:00Z" }, { type: "ACKNOWLEDGED", at: "2026-10-18T11:00:00Z" }, { type: "ASSIGNED", at: "2026-10-18T12:00:00Z" }] },
      t,
      "en",
      name,
    );
    expect(steps.map((s) => [s.title, s.state])).toEqual([
      ["timeline.event.REPORTED", "done"],
      ["timeline.event.ACKNOWLEDGED", "done"],
      ["timeline.event.ASSIGNED", "current"],
      ["timeline.event.IN_PROGRESS", "upcoming"],
      ["timeline.event.RESOLVED", "upcoming"],
    ]);
  });

  it("shows a forwarded rejection with its reason and no upcoming steps", () => {
    const steps = buildSteps(
      { status: "REJECTED", timeline: [{ type: "REPORTED", at: "2026-10-18T10:00:00Z" }, { type: "REJECTED", rejectionType: "NOT_OUR_JURISDICTION", reason: "State highway", at: "2026-10-18T11:00:00Z" }] },
      t,
      "en",
      name,
    );
    expect(steps.at(-1)).toMatchObject({ title: "timeline.event.FORWARDED", detail: "State highway", state: "done" });
    expect(steps).toHaveLength(2);
  });
});
