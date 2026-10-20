// Citizen endpoints (server/src/modules/issues, server/src/modules/notifications).
import { api } from "./client.js";

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString();
  return s ? `?${s}` : "";
};

/** Builds the multipart body for a report. Optional fields are left out when empty. */
export function reportForm({ clientRequestId, photo, categoryKey, description, lat, lng, addressText, device, capturedAt, duplicateCandidateIds }) {
  const f = new FormData();
  f.append("clientRequestId", clientRequestId);
  f.append("categoryKey", categoryKey);
  f.append("description", description);
  f.append("lat", String(lat));
  f.append("lng", String(lng));
  if (addressText?.trim()) f.append("addressText", addressText.trim());
  if (device) {
    f.append("deviceLat", String(device.lat));
    f.append("deviceLng", String(device.lng));
    if (device.accuracyM != null) f.append("deviceAccuracyM", String(Math.round(device.accuracyM)));
  }
  if (capturedAt) f.append("capturedAt", new Date(capturedAt).toISOString());
  if (duplicateCandidateIds?.length) f.append("duplicateCandidateIds", duplicateCandidateIds.join(","));
  f.append("photo", photo, "photo.jpg");
  return f;
}

export const categoriesApi = {
  /** → { categories: [{ key, name, department: { code, name } }] } */
  list: () => api("/categories"),
};

export const issuesApi = {
  /** → { items, page, pageSize, total } */
  mine: ({ page = 1, pageSize = 50 } = {}) => api(`/issues/mine${qs({ page, pageSize })}`),
  /** → { items (with supportedAt), page, pageSize, total } */
  supporting: ({ page = 1, pageSize = 50 } = {}) => api(`/issues/supporting${qs({ page, pageSize })}`),
  /** → { issue } (citizen view: validation, suggestedCategory, timeline, resolution?, feedback?) */
  get: (id) => api(`/issues/${id}`),
  /** → { checked, candidates: [{ id, category, description, status, reportedAt, distanceM, supporters }] } */
  duplicateCheck: ({ categoryKey, description, lat, lng }) =>
    api("/issues/duplicate-check", { method: "POST", body: { categoryKey, description, lat, lng } }),
  /** multipart; → 201 { issue } or 200 { issue, duplicateRequest: true } for a retry with the same clientRequestId */
  create: (form) => api("/issues", { method: "POST", form }),
  /** → { issueId, supporting, alreadySupporting, supporters } */
  support: (id, { fromDuplicatePopup = false } = {}) =>
    api(`/issues/${id}/support`, { method: "POST", body: { fromDuplicatePopup } }),
  /** Only after the AI asked for a retake. → { issue } */
  retakePhoto: (id, photo, capturedAt) => {
    const f = new FormData();
    if (capturedAt) f.append("capturedAt", new Date(capturedAt).toISOString());
    f.append("photo", photo, "photo.jpg");
    return api(`/issues/${id}/photo`, { method: "POST", form: f });
  },
  /** Only while REPORTED. → { issue } */
  withdraw: (id, reason) => api(`/issues/${id}/withdraw`, { method: "POST", body: reason ? { reason } : {} }),
  /** verdict FIXED | NOT_FIXED; NOT_FIXED needs a reason, photo optional. → 201 { feedback } */
  feedback: (id, { verdict, reason, photo }) => {
    const f = new FormData();
    f.append("verdict", verdict);
    if (reason?.trim()) f.append("reason", reason.trim());
    if (photo) f.append("photo", photo, "photo.jpg");
    return api(`/issues/${id}/feedback`, { method: "POST", form: f });
  },
};

export const notificationsApi = {
  /** → { items: [{ id, type, issueId, params, readAt, createdAt }], page, pageSize, total, unread } */
  list: ({ page = 1, pageSize = 30, unreadOnly } = {}) =>
    api(`/notifications${qs({ page, pageSize, unreadOnly: unreadOnly ? "true" : undefined })}`),
  read: (id) => api(`/notifications/${id}/read`, { method: "POST" }),
  readAll: () => api("/notifications/read-all", { method: "POST" }),
};

/** Query keys in one place so mutations can invalidate the right lists. */
export const qk = {
  categories: ["categories"],
  mine: ["issues", "mine"],
  supporting: ["issues", "supporting"],
  issue: (id) => ["issues", "one", id],
  notifications: ["notifications"],
};
