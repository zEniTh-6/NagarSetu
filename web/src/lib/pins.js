// Public map helpers.

/** Groups pins that share a point: [{ key, lat, lng, ids, category }]. */
export function groupPins(pins) {
  const groups = new Map();
  for (const p of pins) {
    const key = `${p.lat},${p.lng}`;
    const g = groups.get(key) ?? { key, lat: p.lat, lng: p.lng, ids: [], categories: new Set() };
    g.ids.push(p.id);
    g.categories.add(p.category);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ categories, ...g }) => ({ ...g, category: categories.size === 1 ? [...categories][0] : null }));
}

const clamp = (v, lim) => Math.min(lim, Math.max(-lim, v));

/**
 * Leaflet's "minLng,minLat,maxLng,maxLat", clamped to valid degrees (a zoomed-out map can go past
 * ±180) and rounded outwards so small jitters reuse the same query without shrinking the box.
 */
export function roundBbox(bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
  const down = (v) => (Math.floor(v * 1e4) / 1e4).toFixed(4);
  const up = (v) => (Math.ceil(v * 1e4) / 1e4).toFixed(4);
  return [down(clamp(minLng, 180)), down(clamp(minLat, 90)), up(clamp(maxLng, 180)), up(clamp(maxLat, 90))].join(",");
}
