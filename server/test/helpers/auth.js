// Helpers for auth tests: create accounts directly and log in with a cookie-keeping agent.
import request from "supertest";
import { hashPassword } from "../../src/auth/password.js";
import { outbox } from "../../src/mail/mailer.js";

let n = 0;
export const PASSWORD = "Correct-Horse-9";

export async function makeUser(prisma, { role = "CITIZEN", password = PASSWORD, ...rest } = {}) {
  n += 1;
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}${n}-${Date.now()}@test.local`,
      name: `${role} ${n}`,
      role,
      passwordHash: password ? await hashPassword(password) : null,
      emailVerified: role !== "CITIZEN",
      ...rest,
    },
  });
}

export async function makeDepartment(prisma, code) {
  n += 1;
  return prisma.department.create({ data: { code: code ?? `D${n}_${Date.now()}`, name: `Department ${n}` } });
}

/** Returns a supertest agent that keeps the session cookie. */
export async function loginAgent(app, email, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export function clearOutbox() {
  outbox.length = 0;
}

export function lastEmailTo(email) {
  return [...outbox].reverse().find((m) => m.to === email);
}

export const otpFrom = (mail) => mail.text.match(/code is: (\d{6})/)[1];
export const resetTokenFrom = (mail) => mail.text.match(/token=([A-Za-z0-9_-]{43})/)[1];
export const inviteTokenFrom = (url) => url.match(/\/invite\/([A-Za-z0-9_-]{43})$/)[1];

export const sessionCookie = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("nagarsetu_session="));
