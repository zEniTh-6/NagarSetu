// Department admin endpoints (server/src/modules/admin, contractors). The server limits every call
// to the admin's department; another department's record answers 404.
import { api } from "./client.js";

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
  return s ? `?${s}` : "";
};
const post = (path, body = {}) => api(path, { method: "POST", body });

export const adminApi = {
  /** → { department, newLast24h, waitingForReview, inProgress, escalated, repairsToReview, disputed, … } */
  dashboard: () => api("/admin/dashboard"),
  /** filters: status, category, flag, priority, sort, q, from, to, stage, page, pageSize */
  issues: (filters = {}) => api(`/admin/issues${qs(filters)}`),
  /** Admin view of one issue (review screen). → { issue } */
  issue: (id) => api(`/issues/${id}`),

  accept: (id, body) => post(`/admin/issues/${id}/accept`, body),
  reject: (id, body) => post(`/admin/issues/${id}/reject`, body),
  forward: (id, body) => post(`/admin/issues/${id}/forward`, body),
  linkDuplicate: (id, body) => post(`/admin/issues/${id}/link-duplicate`, body),
  reroute: (id, body) => post(`/admin/issues/${id}/reroute`, body),
  priority: (id, body) => post(`/admin/issues/${id}/priority`, body),
  assign: (id, body) => post(`/admin/issues/${id}/assign`, body),
  reassign: (id, body) => post(`/admin/issues/${id}/reassign`, body),
  deadline: (id, body) => post(`/admin/issues/${id}/deadline`, body),
  reopen: (id, body) => post(`/admin/issues/${id}/reopen`, body),
  dismissDispute: (id, body) => post(`/admin/issues/${id}/dispute/dismiss`, body),
  clearFlag: (id, flagId, body) => post(`/admin/issues/${id}/flags/${flagId}/clear`, body),
  confirmFlag: (id, flagId, body) => post(`/admin/issues/${id}/flags/${flagId}/confirm`, body),
  approveSubmission: (id, body) => post(`/admin/submissions/${id}/approve`, body),
  rejectSubmission: (id, body) => post(`/admin/submissions/${id}/reject`, body),

  comments: (issueId, { page = 1 } = {}) => api(`/admin/issues/${issueId}/comments${qs({ page })}`),
  reply: (issueId, body) => post(`/admin/issues/${issueId}/replies`, { body }),
  hideComment: (commentId, reason) => post(`/admin/comments/${commentId}/hide`, { reason }),

  submissions: (filters = {}) => api(`/admin/submissions${qs(filters)}`),
  disputes: (filters = {}) => api(`/admin/disputes${qs(filters)}`),
  moderation: (filters = {}) => api(`/admin/comments${qs(filters)}`),
  suspended: (filters = {}) => api(`/admin/citizens/suspended${qs(filters)}`),
  suspend: (citizenId, reason) => post(`/admin/citizens/${citizenId}/suspend`, { reason }),
  reactivate: (citizenId, reason) => post(`/admin/citizens/${citizenId}/reactivate`, { reason }),
  auditLog: (filters = {}) => api(`/admin/audit-log${qs(filters)}`),

  contractors: ({ search, includeInactive } = {}) => api(`/admin/contractors${qs({ search, includeInactive: includeInactive ? "true" : undefined })}`),
  similarContractors: (body) => post("/admin/contractors/similar", body),
  /** → 201 { contractor, inviteUrl, inviteExpiresAt }; 409 SIMILAR_CONTRACTOR_EXISTS unless confirmSimilar */
  createContractor: (body) => post("/admin/contractors", body),
  reissueInvite: (id) => post(`/admin/contractors/${id}/invite`),
  contractorJobs: (id) => api(`/admin/contractors/${id}/jobs`),
  deactivateContractor: (id, reason) => post(`/admin/contractors/${id}/deactivate`, { reason }),
};

export const ak = {
  all: ["admin"],
  dashboard: ["admin", "dashboard"],
  issues: (f) => ["admin", "issues", f],
  issue: (id) => ["admin", "issue", id],
  comments: (id) => ["admin", "comments", id],
  submissions: (f) => ["admin", "submissions", f],
  disputes: (f) => ["admin", "disputes", f],
  moderation: (f) => ["admin", "moderation", f],
  suspended: ["admin", "suspended"],
  audit: (f) => ["admin", "audit", f],
  contractors: (f) => ["admin", "contractors", f],
  jobs: (id) => ["admin", "jobs", id],
};
