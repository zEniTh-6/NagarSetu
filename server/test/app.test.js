import { describe, it, expect, vi, afterAll } from "vitest";
import request from "supertest";
import { Router } from "express";
import { z } from "zod";
import { app, createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { env } from "../src/config/env.js";
import { validate } from "../src/middleware/validate.js";
import { AppError } from "../src/lib/AppError.js";

afterAll(() => prisma.$disconnect());

function appWith(routes) {
  const r = Router();
  routes(r);
  return createApp({ extraRoutes: () => r });
}

describe("health", () => {
  it("returns ok when the database answers", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const broken = { $queryRaw: () => Promise.reject(new Error("connection refused")) };
    const res = await request(createApp({ prisma: broken })).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: "unreachable" });
  });
});

describe("security middleware", () => {
  it("sets Helmet headers and hides x-powered-by", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows CORS only for the web origin", async () => {
    const ok = await request(app).get("/api/health").set("Origin", env.WEB_ORIGIN);
    expect(ok.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN);

    const evil = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers CORS preflight for the web origin only", async () => {
    const ok = await request(app)
      .options("/api/health")
      .set("Origin", env.WEB_ORIGIN)
      .set("Access-Control-Request-Method", "POST");
    expect(ok.status).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(env.WEB_ORIGIN);

    const evil = await request(app)
      .options("/api/health")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("error handling", () => {
  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  it("returns 400 for malformed JSON without a stack trace", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MALFORMED_JSON");
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  it("returns 413 when the JSON body is over the limit", async () => {
    const big = { text: "x".repeat(200 * 1024) };
    const res = await request(app).post("/api/health").send(big);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("hides internal error details behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(
      appWith((r) =>
        r.get("/boom", () => {
          throw new Error("db password is hunter2");
        }),
      ),
    ).get("/boom");
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
  });

  it("handles errors thrown by async handlers (Express 5)", async () => {
    const res = await request(
      appWith((r) =>
        r.get("/async", async () => {
          throw new AppError(403, "FORBIDDEN", "Forbidden");
        }),
      ),
    ).get("/async");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("validate middleware", () => {
  const routes = (r) =>
    r.post(
      "/items/:id",
      validate({
        params: z.object({ id: z.string().uuid() }),
        query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
        body: z.object({ name: z.string().min(1) }),
      }),
      (req, res) => res.json(req.validated),
    );

  it("passes parsed values to the handler", async () => {
    const id = "6f1c2f9e-2b7a-4d3e-9b1a-1a2b3c4d5e6f";
    const res = await request(appWith(routes)).post(`/items/${id}?page=2`).send({ name: "pothole" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id }, query: { page: 2 }, body: { name: "pothole" } });
  });

  it("rejects invalid body, query and params together with 400", async () => {
    const res = await request(appWith(routes)).post("/items/not-a-uuid?page=0").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    const locations = res.body.error.details.issues.map((i) => i.location).sort();
    expect(locations).toEqual(["body", "params", "query"]);
  });
});
