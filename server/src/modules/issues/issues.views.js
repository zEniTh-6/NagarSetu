// What each role gets to see about an issue. Citizens never see internal flags (e.g. SUSPICIOUS).
import { MAX_ATTEMPTS } from "./validation.service.js";

export const photoUrl = (photoId, variant = "public") =>
  `/api/photos/${photoId}${variant === "original" ? "?variant=original" : ""}`;

/** Photo-check state as the citizen sees it. */
export function citizenValidation(issue) {
  if (!issue.aiVerdict) {
    return issue.aiAttempts >= MAX_ATTEMPTS ? { state: "UNDER_REVIEW" } : { state: "CHECKING" };
  }
  if (issue.aiVerdict === "INVALID") return { state: "RETAKE_REQUESTED", reason: issue.aiVerdictReason };
  if (issue.aiVerdict === "UNCERTAIN") return { state: "UNDER_REVIEW" };
  return { state: "OK" };
}

const base = (issue, location, photo) => ({
  id: issue.id,
  status: issue.status,
  statusReason: issue.statusReason,
  // REJECTED: NOT_VALID / NOT_OUR_JURISDICTION ("forwarded") / OTHER; DUPLICATE: the open issue
  rejectionType: issue.rejectionType ?? null,
  duplicateOfId: issue.duplicateOfId ?? null,
  category: { key: issue.category.key, name: issue.category.name },
  description: issue.description,
  location,
  addressText: issue.addressText,
  photo: photo ? { id: photo.id, url: photoUrl(photo.id) } : null,
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
});

export function citizenIssueView(issue, location, photo) {
  const suggestion = issue.aiSuggestedCategory
    ? { key: issue.aiSuggestedCategory.key, name: issue.aiSuggestedCategory.name }
    : null;
  return { ...base(issue, location, photo), validation: citizenValidation(issue), suggestedCategory: suggestion };
}

export function adminIssueView(issue, location, photo, extras = {}) {
  return {
    ...base(issue, location, photo),
    priority: issue.priority,
    priorityReason: issue.priorityReason,
    acknowledgedAt: issue.acknowledgedAt,
    clientRequestId: issue.clientRequestId,
    reporter: issue.reporter ? { id: issue.reporter.id, name: issue.reporter.name } : null,
    departmentId: issue.departmentId,
    photoOriginalUrl: photo ? photoUrl(photo.id, "original") : null,
    device: { lat: issue.deviceLat, lng: issue.deviceLng, accuracyM: issue.deviceAccuracyM, distanceFromPinM: issue.gpsDistanceM },
    ai: {
      verdict: issue.aiVerdict,
      reason: issue.aiVerdictReason,
      riskLevel: issue.aiRiskLevel,
      riskReason: issue.aiRiskReason,
      suggestedCategory: issue.aiSuggestedCategory?.key ?? null,
      model: issue.aiModel,
      attempts: issue.aiAttempts,
      checkedAt: issue.aiCheckedAt,
      embedded: Boolean(issue.embeddedAt),
    },
    flags: (issue.flags ?? []).map((f) => ({
      id: f.id,
      type: f.type,
      reason: f.reason,
      createdAt: f.createdAt,
      confirmed: f.confirmedAt ? { at: f.confirmedAt, reason: f.confirmReason } : null,
    })),
    ...extras,
  };
}
