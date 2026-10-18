import crypto from "node:crypto";
import { seed } from "../../src/seed/seed.js";
import { makeUser, loginAgent } from "./auth.js";
import { cameraJpeg } from "./images.js";

// Inside the SMKC service area (Sangli).
export const SANGLI = { lat: 16.8524, lng: 74.5815 };

/** Seeds departments/categories and returns a logged-in verified citizen. */
export async function citizenSetup(prisma, app) {
  await seed(prisma);
  const citizen = await makeUser(prisma, { role: "CITIZEN", emailVerified: true });
  const agent = await loginAgent(app, citizen.email);
  return { citizen, agent };
}

export async function adminOf(prisma, app, departmentCode) {
  const dept = await prisma.department.findUnique({ where: { code: departmentCode } });
  const admin = await makeUser(prisma, { role: "ADMIN", departmentId: dept.id });
  return { admin, agent: await loginAgent(app, admin.email) };
}

/** Sends a multipart report. `fields` override the defaults; `photo: null` sends none. */
export async function report(agent, { photo, ...fields } = {}) {
  const body = {
    clientRequestId: crypto.randomUUID(),
    categoryKey: "ROADS",
    description: "Big pothole near the bus stand, road pe gaddha hai",
    lat: SANGLI.lat,
    lng: SANGLI.lng,
    ...fields,
  };
  let req = agent.post("/api/issues");
  for (const [k, v] of Object.entries(body)) if (v !== undefined) req = req.field(k, String(v));
  if (photo !== null) req = req.attach("photo", photo ?? (await cameraJpeg()), { filename: "photo.jpg", contentType: "image/jpeg" });
  return req;
}

/** A validator that always answers the same (tests never call the real Gemini). */
export const fakeValidator = (answer) => async () => ({
  verdict: "VALID",
  reason: "Pothole clearly visible",
  suggestedCategory: null,
  risk: { level: "MEDIUM", reason: "On a busy road" },
  model: "fake-model",
  ...answer,
});
