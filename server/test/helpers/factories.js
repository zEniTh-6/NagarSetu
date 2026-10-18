// Small builders for test data.
import crypto from "node:crypto";
import { pointGeography } from "../../src/geo/point.js";

let counter = 0;
const uniq = () => `${Date.now()}-${++counter}`;

export async function createDepartment(prisma, overrides = {}) {
  const n = uniq();
  return prisma.department.create({ data: { code: `DEPT_${n.replace(/\W/g, "_")}`, name: `Dept ${n}`, ...overrides } });
}

export async function createCategory(prisma, departmentId, overrides = {}) {
  return prisma.category.create({ data: { key: `CAT_${uniq().replace(/\W/g, "_")}`, name: "Cat", departmentId, ...overrides } });
}

export async function createUser(prisma, overrides = {}) {
  return prisma.user.create({
    data: { email: `user-${uniq()}@test.local`, name: "Test User", role: "CITIZEN", ...overrides },
  });
}

/** Issues must be inserted with raw SQL because `location` is an Unsupported column. */
export async function insertIssue(prisma, { reporterId, categoryId, departmentId, lat, lng, clientRequestId, description = "road pe gaddha hai" }) {
  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO issues (id, reporter_id, client_request_id, category_id, department_id, description, location, updated_at)
    VALUES (${id}::uuid, ${reporterId}::uuid, ${clientRequestId ?? crypto.randomUUID()}, ${categoryId}::uuid,
            ${departmentId}::uuid, ${description}, ${pointGeography({ lat, lng })}, now())`;
  return id;
}
