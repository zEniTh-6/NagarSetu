// Location rules for a new report.
import { AppError } from "../../lib/AppError.js";

export const GPS_RULES = Object.freeze({
  goodAccuracyM: 50, // device accuracy at or better than this counts as "good"
  suspiciousExtraM: 300, // with good accuracy: SUSPICIOUS when distance > accuracy + this
});

export function assertInServiceArea({ lat, lng }, bbox) {
  if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) {
    throw new AppError(422, "OUTSIDE_SERVICE_AREA", "This location is outside the area NagarSetu covers");
  }
}

/**
 * Compares the pin with device GPS. GPS mismatch is never proof of fraud:
 *   NONE       – no device location (permission denied/unavailable): neutral
 *   OK         – close enough
 *   MILD       – far, but the GPS accuracy is poor: recorded only
 *   SUSPICIOUS – far, with good accuracy: SUSPICIOUS flag (a human should look; never blocks)
 */
export function classifyGps({ distanceM, accuracyM }) {
  if (distanceM == null) return "NONE";
  const accuracy = accuracyM ?? Infinity;
  const good = accuracy <= GPS_RULES.goodAccuracyM;
  if (good) return distanceM > accuracy + GPS_RULES.suspiciousExtraM ? "SUSPICIOUS" : "OK";
  return distanceM > GPS_RULES.goodAccuracyM + GPS_RULES.suspiciousExtraM ? "MILD" : "OK";
}
