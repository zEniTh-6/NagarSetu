// What each role sees of assignments and repair submissions.
import { photoUrl } from "../issues/issues.views.js";
import { deadlineView } from "./deadline.js";

const firstPhoto = (s) => s.photos?.find((p) => p.kind === "REPAIR_EVIDENCE") ?? null;

/**
 * Where a job stands for the contractor (one place, so tabs and labels always agree):
 * NEW (not started) · IN_PROGRESS · REWORK (last evidence rejected) · SUBMITTED (waiting for the
 * admin) · COMPLETED (their evidence was approved).
 */
export function jobStage(assignment) {
  const subs = assignment.submissions ?? [];
  const last = subs[subs.length - 1];
  if (assignment.endedAt) return subs.some((x) => x.status === "APPROVED") ? "COMPLETED" : "ENDED";
  if (last?.status === "SUBMITTED") return "SUBMITTED";
  if (!assignment.startedAt) return "NEW";
  if (last?.status === "REJECTED") return "REWORK";
  return "IN_PROGRESS";
}

/** Contractor: exact location, description, the citizen's photo (public copy), priority, deadline,
 *  the assigning department and its note, and their own submissions with the admin's reasons.
 *  No reporter details, no AI data, no flags. */
export function contractorJobView(assignment, location, now = new Date()) {
  const issue = assignment.issue;
  const photo = issue.photos?.[0];
  const stage = jobStage(assignment);
  return {
    issueId: issue.id,
    status: issue.status,
    stage,
    category: { key: issue.category.key, name: issue.category.name },
    description: issue.description,
    location,
    addressText: issue.addressText,
    areaName: issue.areaName ?? null,
    photo: photo ? { id: photo.id, url: photoUrl(photo.id) } : null,
    priority: issue.priority,
    department: assignment.department ? { name: assignment.department.name } : null,
    note: assignment.note ?? null,
    assignedAt: assignment.createdAt,
    startedAt: assignment.startedAt,
    completedAt: stage === "COMPLETED" ? assignment.endedAt : null,
    deadline: deadlineView(assignment, now),
    submissions: (assignment.submissions ?? []).map((s) => {
      const p = firstPhoto(s);
      return {
        id: s.id,
        status: s.status,
        note: s.note,
        capturedAt: s.capturedAt,
        captureSource: s.captureSource ?? null,
        submittedAt: s.createdAt,
        photo: p ? { id: p.id, url: photoUrl(p.id) } : null,
        reviewReason: s.reviewReason,
        reviewedAt: s.reviewedAt,
      };
    }),
  };
}

/** Admin: everything needed to compare the original and the evidence. */
export function adminSubmissionView(s) {
  const p = firstPhoto(s);
  return {
    id: s.id,
    status: s.status,
    contractorId: s.contractorId,
    assignmentId: s.assignmentId,
    note: s.note,
    capturedAt: s.capturedAt,
    captureSource: s.captureSource ?? null, // CAMERA | GALLERY | null (not reported); a signal only
    submittedAt: s.createdAt,
    device: { lat: s.deviceLat, lng: s.deviceLng, accuracyM: s.deviceAccuracyM, distanceFromIssueM: s.gpsDistanceM == null ? null : Math.round(s.gpsDistanceM) },
    photo: p ? { id: p.id, url: photoUrl(p.id), originalUrl: photoUrl(p.id, "original") } : null,
    ai: { verdict: s.aiVerdict, reason: s.aiVerdictReason, model: s.aiModel, attempts: s.aiAttempts, checkedAt: s.aiCheckedAt },
    review: s.reviewedAt ? { byId: s.reviewedById, at: s.reviewedAt, reason: s.reviewReason } : null,
  };
}

export function adminAssignmentView(a, now = new Date()) {
  return {
    id: a.id,
    contractor: a.contractor
      ? { id: a.contractor.id, name: a.contractor.name, phone: a.contractor.phone, workType: a.contractor.workType, status: a.contractor.status }
      : { id: a.contractorId },
    assignedById: a.assignedById,
    note: a.note ?? null,
    assignedAt: a.createdAt,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    endReason: a.endReason,
    deadline: deadlineView(a, now),
  };
}
