// Department scope for admins. Services use these so an admin only ever sees their department.
import { AppError } from "../lib/AppError.js";

/**
 * Prisma `where` fragment for an admin's department: `where: { ...departmentScope(user), status }`.
 * Throws for non-admins so a missing role check can't turn into "see everything".
 */
export function departmentScope(user) {
  if (user?.role !== "ADMIN" || !user.departmentId) throw new AppError(403, "FORBIDDEN", "Forbidden");
  return { departmentId: user.departmentId };
}

/**
 * For a record already loaded by id: another department's record answers 404, exactly like a
 * record that doesn't exist, so admins can't probe other departments.
 */
export function assertInDepartment(user, record) {
  const { departmentId } = departmentScope(user);
  if (!record || record.departmentId !== departmentId) throw new AppError(404, "NOT_FOUND", "Not found");
  return record;
}
