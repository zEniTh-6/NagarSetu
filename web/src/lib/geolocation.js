// "Use my location": the device position and its accuracy. Denied or unavailable is neutral (brief:
// no device location is never suspicious); the citizen places the pin by hand.

/** @returns {Promise<{ lat: number, lng: number, accuracyM: number }>} rejects with { code: DENIED | UNAVAILABLE | TIMEOUT } */
export function getDevicePosition({ timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject({ code: "UNAVAILABLE" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      (err) => reject({ code: err.code === 1 ? "DENIED" : err.code === 3 ? "TIMEOUT" : "UNAVAILABLE" }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
