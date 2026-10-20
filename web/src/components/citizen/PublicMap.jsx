// Public map (design/stitch/citizen/map-view). Pins are APPROXIMATE (snapped by the server, D-025);
// pins on the same spot are one marker with a count. Reports the box whenever the map stops moving.
// Kept separate so tests can replace it (jsdom can't render Leaflet).
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import "../MapView.jsx"; // Leaflet CSS + default marker icons
import { SANGLI_CENTER } from "../../lib/serviceArea.js";
import { useCategoryName } from "./CategoryIcon.jsx";
import { groupPins } from "../../lib/pins.js";

// DESIGN.md category accents (same as the icon tiles).
const COLOR = { ROADS: "#285347", GARBAGE: "#B65C40", STREETLIGHT: "#7D6A3E" };
const MIXED = "#142B28";

// Only numbers and fixed colours go into the HTML (never user text).
const icon = (count, category) => {
  const size = count > 1 ? 34 : 26;
  const color = COLOR[category] ?? MIXED;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:700 13px/1 Inter,sans-serif">${count > 1 ? Number(count) : ""}</span>`,
  });
};

function BoundsWatcher({ onBounds }) {
  const map = useMap();
  useMapEvents({ moveend: () => onBounds(map.getBounds().toBBoxString()) });
  useEffect(() => {
    onBounds(map.getBounds().toBBoxString());
  }, [map, onBounds]);
  return null;
}

/** pins: [{ id, lat, lng, category }] · onBounds(bboxString) · onSelect(ids) */
export default function PublicMap({ pins, onBounds, onSelect, className = "h-[60dvh] min-h-80" }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const groups = useMemo(() => groupPins(pins), [pins]);
  return (
    <div role="region" aria-label={t("map.label")} className={["isolate overflow-hidden rounded-card border border-stone-300", className].join(" ")}>
      <MapContainer center={[SANGLI_CENTER.lat, SANGLI_CENTER.lng]} zoom={13} className="size-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsWatcher onBounds={onBounds} />
        {groups.map((g) => {
          const label = t("publicMap.pin", { count: g.ids.length, category: g.category ? categoryName(g.category) : t("feed.all") });
          return (
            <Marker
              key={g.key}
              position={[g.lat, g.lng]}
              icon={icon(g.ids.length, g.category)}
              title={label}
              alt={label}
              keyboard
              eventHandlers={{ click: () => onSelect(g.ids) }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
