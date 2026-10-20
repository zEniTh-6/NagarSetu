// Phase 7b: public feed, public map, public issue view and area names (D-022, D-025).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";
import { createMemoryQueue } from "../src/jobs/queue.js";
import { snapPoint, pinsInBox, PUBLIC_GRID_DEG } from "../src/geo/public.js";
import { publicSql } from "../src/modules/feed/visibility.js";
import { runAreaLookup, MAX_AREA_ATTEMPTS } from "../src/modules/feed/areaName.service.js";
import { createAreaLookup, createThrottle, pickAreaName, AreaLookupError } from "../src/places/areaName.js";
import { resetDb } from "./helpers/db.js";
import { makeTestApp, tempStorage } from "./helpers/app.js";
import { makeUser, loginAgent } from "./helpers/auth.js";
import { citizenSetup, adminOf, SANGLI } from "./helpers/issues.js";
import { newReport, setAi, anotherCitizen } from "./helpers/admin.js";
import { contractorSetup } from "./helpers/work.js";
import { cameraJpeg } from "./helpers/images.js";
import request from "supertest";

let app, agent, citizen, roads, viewer;

beforeEach(async () => {
  await resetDb(prisma);
  app = makeTestApp({ jobs: createMemoryQueue(), storage: tempStorage() });
  ({ agent, citizen } = await citizenSetup(prisma, app));
  roads = await adminOf(prisma, app, "CONSTRUCTION");
  viewer = await anotherCitizen(prisma, app);
});
afterAll(() => prisma.$disconnect());

const publicReport = async (fields) => {
  const issue = await newReport(agent, fields);
  await setAi(prisma, issue.id, { verdict: "VALID" });
  return issue;
};
const feedIds = async (a = viewer.agent, query = "") => (await a.get(`/api/feed${query}`)).body.items.map((i) => i.id);

describe("which reports are public (D-022)", () => {
  it("VALID or acknowledged, and open or resolved; never checking, uncertain, invalid, rejected or withdrawn", async () => {
    const valid = await publicReport({ description: "valid photo pothole" });
    const uncertain = await newReport(agent, { description: "uncertain photo here" });
    await setAi(prisma, uncertain.id, { verdict: "UNCERTAIN" });
    const invalid = await newReport(agent, { description: "a selfie not a road" });
    await setAi(prisma, invalid.id, { verdict: "INVALID" });
    await newReport(agent, { description: "still being checked" });
    const accepted = await newReport(agent, { description: "uncertain but accepted" });
    await setAi(prisma, accepted.id, { verdict: "UNCERTAIN" });
    expect((await roads.agent.post(`/api/admin/issues/${accepted.id}/accept`).send({})).status).toBe(200);
    const rejected = await publicReport({ description: "valid but rejected" });
    await roads.agent.post(`/api/admin/issues/${rejected.id}/reject`).send({ type: "OTHER", reason: "Private property" });
    const withdrawn = await publicReport({ description: "valid but withdrawn" });
    expect((await agent.post(`/api/issues/${withdrawn.id}/withdraw`).send({})).status).toBe(200);
    const resolved = await publicReport({ description: "valid and resolved" });
    await prisma.issue.update({ where: { id: resolved.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });

    expect(await feedIds()).toEqual([resolved.id, accepted.id, valid.id]);
    const res = await viewer.agent.get("/api/feed");
    expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
  });

  it("filters by category and pages", async () => {
    const road = await publicReport({ description: "pothole one" });
    const bin = await publicReport({ categoryKey: "GARBAGE", description: "overflowing bin here" });
    expect(await feedIds(viewer.agent, "?category=ROADS")).toEqual([road.id]);
    expect(await feedIds(viewer.agent, "?category=GARBAGE")).toEqual([bin.id]);
    expect(await feedIds(viewer.agent, "?category=NOPE")).toEqual([]);
    const page2 = await viewer.agent.get("/api/feed?pageSize=1&page=2");
    expect(page2.body.items.map((i) => i.id)).toEqual([road.id]);
    expect((await viewer.agent.get("/api/feed?category=roads")).status).toBe(400);
  });

  it("is for signed-in citizens only", async () => {
    expect((await request(app).get("/api/feed")).status).toBe(401);
    expect((await roads.agent.get("/api/feed")).status).toBe(403);
    const { agent: contractor } = await contractorSetup(prisma, app);
    expect((await contractor.get("/api/feed")).status).toBe(403);
    expect((await contractor.get("/api/feed/map?bbox=74.5,16.8,74.7,16.9")).status).toBe(403);
    // Unverified citizens can read the feed (they can't upvote or comment).
    const unverified = await makeUser(prisma, { role: "CITIZEN" });
    expect((await (await loginAgent(app, unverified.email)).get("/api/feed")).status).toBe(200);
  });
});

describe("feed card: no reporter, no exact location", () => {
  it("shows the snapped point (≤ ~150 m away), area name, stripped photo, counts; leaks nothing else", async () => {
    const issue = await publicReport({ addressText: "House 12, Lane 4, Ganpati Peth" });
    await prisma.issue.update({ where: { id: issue.id }, data: { areaName: "Ganpati Peth" } });
    const [card] = (await viewer.agent.get("/api/feed")).body.items;

    expect(card).toMatchObject({
      id: issue.id,
      visibility: "PUBLIC",
      status: "REPORTED",
      category: { key: "ROADS" },
      description: "Big pothole near the bus stand, road pe gaddha hai",
      areaName: "Ganpati Peth",
      approxLocation: { ...snapPoint(SANGLI), radiusM: 150 },
      community: { upvotes: 0, supporters: 0, comments: 0 },
      viewer: { upvoted: false, relation: null },
      latestOfficialReply: null,
    });
    expect(card.photo.url).toBe(`/api/photos/${card.photo.id}`);
    expect(Math.abs(card.approxLocation.lat - SANGLI.lat)).toBeLessThanOrEqual(PUBLIC_GRID_DEG / 2);
    expect(Math.abs(card.approxLocation.lng - SANGLI.lng)).toBeLessThanOrEqual(PUBLIC_GRID_DEG / 2);

    const json = JSON.stringify(card);
    for (const leak of [citizen.id, citizen.email, citizen.name, String(SANGLI.lat), String(SANGLI.lng), "House 12"]) expect(json).not.toContain(leak);
    for (const key of ["location", "addressText", "reporter", "flags", "ai", "priority", "validation", "statusReason"]) expect(card[key]).toBeUndefined();
  });

  it("no area name yet → null (the web app shows 'Approximate location'); the reporter sees their own card marked", async () => {
    await publicReport();
    const [card] = (await agent.get("/api/feed")).body.items;
    expect(card.areaName).toBeNull();
    expect(card.viewer.relation).toBe("REPORTER");
  });
});

describe("public issue view (GET /api/issues/:id for a citizen who doesn't follow it)", () => {
  it("public: no reporter, no exact location, dates-only timeline", async () => {
    const issue = await publicReport();
    await roads.agent.post(`/api/admin/issues/${issue.id}/accept`).send({});
    const res = await viewer.agent.get(`/api/issues/${issue.id}`);
    expect(res.status).toBe(200);
    const v = res.body.issue;
    expect(v).toMatchObject({ visibility: "PUBLIC", status: "ACKNOWLEDGED", approxLocation: snapPoint(SANGLI) });
    expect(v.timeline).toEqual([
      { type: "REPORTED", at: expect.any(String) },
      { type: "ACKNOWLEDGED", at: expect.any(String) },
    ]);
    for (const key of ["location", "addressText", "relation", "feedback", "validation", "suggestedCategory"]) expect(v[key]).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain(citizen.id);
  });

  it("not public → 404 for other citizens; the reporter keeps the full view (exact location) plus counts", async () => {
    const hidden = await newReport(agent);
    expect((await viewer.agent.get(`/api/issues/${hidden.id}`)).status).toBe(404);
    const own = (await agent.get(`/api/issues/${hidden.id}`)).body.issue;
    expect(own).toMatchObject({ visibility: "FOLLOWER", relation: "REPORTER", public: false, location: SANGLI, community: { upvotes: 0, supporters: 0, comments: 0 } });

    const rejected = await publicReport();
    await roads.agent.post(`/api/admin/issues/${rejected.id}/reject`).send({ type: "NOT_VALID", reason: "Not a pothole" });
    expect((await viewer.agent.get(`/api/issues/${rejected.id}`)).status).toBe(404);
  });

  it("a supporter gets the approximate area, never the exact spot or the typed address (detail and Supporting list)", async () => {
    const issue = await publicReport({ addressText: "House 12, Lane 4" });
    expect((await viewer.agent.post(`/api/issues/${issue.id}/support`).send({})).status).toBe(200);
    const v = (await viewer.agent.get(`/api/issues/${issue.id}`)).body.issue;
    expect(v).toMatchObject({ visibility: "FOLLOWER", relation: "SUPPORTER", approxLocation: { ...snapPoint(SANGLI), radiusM: 150 } });
    expect(v.location).toBeUndefined();
    expect(v.addressText).toBeUndefined();
    const [item] = (await viewer.agent.get("/api/issues/supporting")).body.items;
    expect(item.location).toBeUndefined();
    expect(item.addressText).toBeUndefined();
    expect(item.approxLocation).toMatchObject(snapPoint(SANGLI));
    for (const json of [JSON.stringify(v), JSON.stringify(item)]) {
      expect(json).not.toContain("House 12");
      expect(json).not.toContain(String(SANGLI.lat));
    }
    // The reporter still sees the exact spot.
    expect((await agent.get(`/api/issues/${issue.id}`)).body.issue).toMatchObject({ location: SANGLI, addressText: "House 12, Lane 4" });
  });

  it("contractors and other departments' admins still get 404", async () => {
    const issue = await publicReport();
    const { agent: contractor } = await contractorSetup(prisma, app);
    expect((await contractor.get(`/api/issues/${issue.id}`)).status).toBe(404);
    const swm = await adminOf(prisma, app, "SOLID_WASTE");
    expect((await swm.agent.get(`/api/issues/${issue.id}`)).status).toBe(404);
  });
});

describe("photos of public issues", () => {
  it("any citizen gets the stripped copy of the current photo; never the original, a replaced photo or a non-public issue's", async () => {
    const issue = await newReport(agent);
    const firstPhotoId = issue.photo.id;
    expect((await viewer.agent.get(`/api/photos/${firstPhotoId}`)).status).toBe(404); // not public yet

    // The AI asked for a retake; the citizen sends a new photo; the admin accepts → public.
    await setAi(prisma, issue.id, { verdict: "INVALID" });
    const retake = await agent.post(`/api/issues/${issue.id}/photo`).attach("photo", await cameraJpeg(), { filename: "p.jpg", contentType: "image/jpeg" });
    expect(retake.status).toBe(200);
    const newPhotoId = retake.body.issue.photo.id;
    await roads.agent.post(`/api/admin/issues/${issue.id}/accept`).send({});

    const ok = await viewer.agent.get(`/api/photos/${newPhotoId}`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/jpeg");
    expect((await viewer.agent.get(`/api/photos/${newPhotoId}?variant=original`)).status).toBe(404);
    expect((await viewer.agent.get(`/api/photos/${firstPhotoId}`)).status).toBe(404);
  });
});

describe("GET /api/feed/map", () => {
  const box = (minLng, minLat, maxLng, maxLat) => `/api/feed/map?bbox=${minLng},${minLat},${maxLng},${maxLat}`;

  it("returns snapped pins of public issues inside the box, with category and status", async () => {
    const issue = await publicReport();
    await newReport(agent, { description: "not public yet here" });
    const res = await viewer.agent.get(box(74.5, 16.8, 74.7, 16.9));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pins: [{ id: issue.id, ...snapPoint(SANGLI), category: "ROADS", status: "REPORTED" }], truncated: false });
    expect((await viewer.agent.get(`${box(74.5, 16.8, 74.7, 16.9)}&category=GARBAGE`)).body.pins).toEqual([]);
  });

  it("filters on the snapped point, so moving the box edge can't reveal the exact spot", async () => {
    await publicReport(); // exact 16.8524, snapped 16.852
    // Box contains the exact point but not the snapped one → no pin.
    expect((await viewer.agent.get(box(74.5, 16.8523, 74.7, 16.9))).body.pins).toHaveLength(0);
    // Box contains the snapped point but not the exact one → pin.
    expect((await viewer.agent.get(box(74.5, 16.8, 74.7, 16.8521))).body.pins).toHaveLength(1);
  });

  it("caps the number of pins and says so", async () => {
    for (let i = 0; i < 3; i += 1) await publicReport({ description: `pothole number ${i}` });
    const r = await pinsInBox(prisma, { bbox: { minLng: 74.5, minLat: 16.8, maxLng: 74.7, maxLat: 16.9 }, publicFilter: publicSql(), limit: 2 });
    expect(r.pins).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it("rejects a malformed box", async () => {
    expect((await viewer.agent.get("/api/feed/map")).status).toBe(400);
    expect((await viewer.agent.get(box(74.7, 16.8, 74.5, 16.9))).status).toBe(400);
    expect((await viewer.agent.get("/api/feed/map?bbox=1,2,3")).status).toBe(400);
    expect((await viewer.agent.get("/api/feed/map?bbox=a,b,c,d")).status).toBe(400);
  });
});

describe("area name lookup (background job, D-025)", () => {
  it("looks up the SNAPPED point once and stores the name", async () => {
    const issue = await newReport(agent);
    const calls = [];
    const lookupArea = async (p) => (calls.push(p), "Ganpati Peth");
    expect(await runAreaLookup(prisma, { issueId: issue.id }, { lookupArea })).toEqual({ outcome: "done", areaName: "Ganpati Peth" });
    expect(calls).toEqual([snapPoint(SANGLI)]);
    expect(await runAreaLookup(prisma, { issueId: issue.id }, { lookupArea })).toMatchObject({ outcome: "skipped" });
    expect(calls).toHaveLength(1);
    expect((await prisma.issue.findUnique({ where: { id: issue.id } })).areaName).toBe("Ganpati Peth");
  });

  it("no name found → stored as none, not retried", async () => {
    const issue = await newReport(agent);
    expect(await runAreaLookup(prisma, { issueId: issue.id }, { lookupArea: async () => null })).toEqual({ outcome: "done", areaName: null });
    const row = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(row.areaName).toBeNull();
    expect(row.areaLookedUpAt).not.toBeNull();
  });

  it("failures retry (spaced by the queue) and give up after the last attempt, never touching the report", async () => {
    const issue = await newReport(agent);
    const failing = async () => {
      throw new AreaLookupError("Nominatim answered HTTP 503");
    };
    for (let i = 1; i < MAX_AREA_ATTEMPTS; i += 1) {
      expect((await runAreaLookup(prisma, { issueId: issue.id }, { lookupArea: failing })).outcome).toBe("retry");
    }
    expect((await runAreaLookup(prisma, { issueId: issue.id }, { lookupArea: failing })).outcome).toBe("gave_up");
    const row = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(row).toMatchObject({ areaName: null, areaLookupAttempts: MAX_AREA_ATTEMPTS, status: "REPORTED" });
    expect((await runAreaLookup(prisma, { issueId: issue.id }, { lookupArea: async () => "x" })).outcome).toBe("skipped");
  });

  it("calls Nominatim reverse at suburb level with an identifying User-Agent", async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url: new URL(url), init });
      return { ok: true, json: async () => ({ address: { road: "MG Road", house_number: "12", suburb: "Vishrambag", city: "Sangli" } }) };
    };
    const lookup = createAreaLookup({ baseUrl: "https://nominatim.example", userAgent: "NagarSetu-test (contact)", fetchImpl, throttle: (fn) => fn() });
    expect(await lookup({ lat: 16.852, lng: 74.582 })).toBe("Vishrambag");
    const { url, init } = requests[0];
    expect(url.pathname).toBe("/reverse");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ lat: "16.852", lon: "74.582", zoom: "14", format: "jsonv2" });
    expect(init.headers["User-Agent"]).toBe("NagarSetu-test (contact)");
  });

  it("HTTP errors and network errors become AreaLookupError; an 'Unable to geocode' answer is no name", async () => {
    const lookup = (fetchImpl) => createAreaLookup({ baseUrl: "https://n.example", fetchImpl, throttle: (fn) => fn() });
    await expect(lookup(async () => ({ ok: false, status: 429 }))({ lat: 1, lng: 1 })).rejects.toBeInstanceOf(AreaLookupError);
    await expect(lookup(async () => Promise.reject(new Error("ECONNRESET")))({ lat: 1, lng: 1 })).rejects.toBeInstanceOf(AreaLookupError);
    expect(await lookup(async () => ({ ok: true, json: async () => ({ error: "Unable to geocode" }) }))({ lat: 1, lng: 1 })).toBeNull();
  });

  it("picks the most specific area field, never the road or house number", () => {
    expect(pickAreaName({ neighbourhood: "Khanbhag", suburb: "Sangli" })).toBe("Khanbhag");
    expect(pickAreaName({ road: "MG Road", house_number: "4", city: "Sangli" })).toBe("Sangli");
    expect(pickAreaName({ road: "MG Road" })).toBeNull();
    expect(pickAreaName(undefined)).toBeNull();
  });

  it("the throttle keeps calls at least the interval apart", async () => {
    let clock = 0;
    const waits = [];
    const throttle = createThrottle(1100, { now: () => clock, sleep: async (ms) => (waits.push(ms), (clock += ms)) });
    const at = [];
    await Promise.all([1, 2, 3].map(() => throttle(async () => at.push(clock))));
    expect(at).toEqual([0, 1100, 2200]);
    expect(waits).toEqual([1100, 1100]);
  });
});
