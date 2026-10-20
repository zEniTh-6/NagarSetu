// Map with a draggable report pin (Leaflet + OpenStreetMap). Tapping the map also moves the pin.
// Kept separate so tests can replace it (jsdom can't render Leaflet).
import { useEffect } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import "../MapView.jsx"; // Leaflet CSS + default marker icons
import { SANGLI_CENTER } from "../../lib/serviceArea.js";

function ClickToMove({ onMove }) {
  useMapEvents({ click: (e) => onMove({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FollowPin({ pin, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (pin) map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), zoom), { animate: true });
  }, [map, pin, zoom]);
  return null;
}

/**
 * pin: { lat, lng } | null · device: { lat, lng, accuracyM } | null · onMove(pin) when dragged or tapped.
 * `followKey` changes when the pin should be brought into view (search result, "use my location").
 */
export default function PinMap({ pin, device, onMove, followKey, interactive = true, className = "h-80" }) {
  const { t } = useTranslation();
  const center = pin ?? SANGLI_CENTER;
  return (
    <div role="region" aria-label={t("map.label")} className={["isolate overflow-hidden rounded-card border border-stone-300", className].join(" ")}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={pin ? 17 : 13}
        scrollWheelZoom={false}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {device && <Circle center={[device.lat, device.lng]} radius={device.accuracyM} pathOptions={{ color: "#285347", weight: 1, fillOpacity: 0.12 }} />}
        {pin && (
          <Marker
            position={[pin.lat, pin.lng]}
            draggable={interactive}
            keyboard={interactive}
            title={t("location.pinTitle")}
            alt={t("location.pinTitle")}
            eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); onMove?.({ lat: p.lat, lng: p.lng }); } }}
          />
        )}
        {interactive && <ClickToMove onMove={(p) => onMove?.(p)} />}
        <FollowPin key={followKey} pin={pin} zoom={17} />
      </MapContainer>
    </div>
  );
}
