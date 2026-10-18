// Validate request body, query and params with Zod schemas. Every route uses this.
// Parsed (and coerced) values replace the raw ones on req.validated.
import { AppError } from "../lib/AppError.js";

export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    const issues = [];
    const validated = {};
    for (const [part, schema] of Object.entries({ body, query, params })) {
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const i of result.error.issues) {
          issues.push({ location: part, path: i.path.join("."), message: i.message });
        }
      }
    }
    if (issues.length) return next(new AppError(400, "VALIDATION_FAILED", "Invalid request", { issues }));
    req.validated = validated;
    next();
  };
}
