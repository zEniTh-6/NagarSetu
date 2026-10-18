// What each role sees of assignments and repair submissions.
import { photoUrl } from "../issues/issues.views.js";
import { deadlineView } from "./deadline.js";

const firstPhoto = (s) => s.photos?.find((p) => p.kind === "REPAIR_EVIDENCE") ?? null;

/** Contractor: exact location, description, the citizen's photo (public copy), priority, deadline,
 *  and their own submissions with the admin's rejection reasons. No reporter details, no AI data. */
export function contractorJobView(assignment, location, now = new Date()) {
  const issue = assignment.issue;
  const photo = issue.photos?.[0];
  return {
    issueId: issue.id,
    status: issue.status,
    category: { key: issue.category.key, name: issue.category.name },
    description: issue.description,
    location,
    addressText: issue.addressText,
    photo: photo ? { id: photo.id, url: photoUrl(photo.id) } : null,
    priority: issue.priority,
    assignedAt: assignment.createdAt,
    startedAt: assignment.startedAt,
    deadline: deadlineView(assignment, now),
    submissions: (assignment.submissions ?? []).map((s) => {
      const p = firstPhoto(s);
      return {
        id: s.id,
        status: s.status,
        note: s.note,
        capturedAt: s.capturedAt,
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
    assignedAt: a.createdAt,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    endReason: a.endReason,
    deadline: deadlineView(a, now),
  };
}
