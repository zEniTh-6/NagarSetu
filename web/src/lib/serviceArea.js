// The area NagarSetu covers (D-012, SERVICE_AREA_BBOX in .env). The server is the authority and
// answers OUTSIDE_SERVICE_AREA; this copy only lets the form warn before uploading.
export const SERVICE_AREA = Object.freeze({ minLng: 74.518889, minLat: 16.774444, maxLng: 74.680833, maxLat: 16.895833 });

export const SANGLI_CENTER = Object.freeze({ lat: 16.8524, lng: 74.5815 });

export const inServiceArea = (lat, lng) =>
  lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat && lng >= SERVICE_AREA.minLng && lng <= SERVICE_AREA.maxLng;
