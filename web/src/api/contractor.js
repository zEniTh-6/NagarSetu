// Contractor endpoints (server/src/modules/work). The server only ever returns the contractor's
// own jobs; anything else answers 404. There is no endpoint that resolves an issue.
import { api } from "./client.js";
import { uploadForm } from "./upload.js";

/** Multipart body for repair evidence. Optional fields are left out when empty. */
export function evidenceForm({ clientRequestId, photo, note, capturedAt, captureSource, device }) {
  const f = new FormData();
  f.append("clientRequestId", clientRequestId);
  if (note?.trim()) f.append("note", note.trim());
  if (capturedAt) f.append("capturedAt", new Date(capturedAt).toISOString());
  if (captureSource) f.append("captureSource", captureSource);
  if (device) {
    f.append("deviceLat", String(device.lat));
    f.append("deviceLng", String(device.lng));
    if (device.accuracyM != null) f.append("deviceAccuracyM", String(Math.round(device.accuracyM)));
  }
  f.append("photo", photo, "repair.jpg");
  return f;
}

export const contractorApi = {
  /** → { contractor: { name, email, phone, workType, licenceNumber, activeJobs, completedJobs } } */
  me: () => api("/contractor/me"),
  /** Current jobs, nearest deadline first. → { items } */
  jobs: () => api("/contractor/issues"),
  /** Jobs whose evidence was approved, newest first. → { items, page, pageSize, total } */
  completed: ({ page = 1 } = {}) => api(`/contractor/issues?state=completed&page=${page}`),
  /** → { job } */
  job: (id) => api(`/contractor/issues/${id}`),
  /** ACKNOWLEDGED → IN_PROGRESS. → { job } */
  start: (id) => api(`/contractor/issues/${id}/start`, { method: "POST" }),
  /** → 201 { job } or 200 { job, duplicateRequest: true } for a retry with the same clientRequestId */
  submit: (id, form, opts) => uploadForm(`/contractor/issues/${id}/submissions`, form, opts),
};

export const ck = {
  me: ["contractor", "me"],
  jobs: ["contractor", "jobs"],
  completed: ["contractor", "completed"],
  job: (id) => ["contractor", "job", id],
};
