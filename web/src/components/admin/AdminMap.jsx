// Exact pin (teal marker) vs a device GPS point (red dot) with its accuracy circle and a dashed line
// between them. Used for the report (citizen's phone) and repair evidence (contractor's phone).
// Kept separate so tests can replace it (jsdom can't render Leaflet).
import { useEffect } from "react";
import L from "leaflet";
import { Circle, CircleMarker, Marker, Polyline, useMap } from "react-leaflet";
import { MapView } from "../MapView.jsx";

function Fit({ points }) {
  const map = useMap();
  const key = JSON.stringify(points); // fit once per set of points, not on every render
  useEffect(() => {
    const pts = JSON.parse(key);
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 18 });
  }, [map, key]);
  return null;
}

/** pin: { lat, lng } · device: { lat, lng, accuracyM } | null. The page shows the legend and distance as text. */
export default function AdminMap({ pin, device, label, pinTitle, className = "h-72" }) {
  const hasDevice = device?.lat != null && device?.lng != null;
  const points = hasDevice ? [[pin.lat, pin.lng], [device.lat, device.lng]] : [[pin.lat, pin.lng]];
  return (
    <MapView center={[pin.lat, pin.lng]} zoom={17} className={className} label={label}>
      <Marker position={[pin.lat, pin.lng]} title={pinTitle} alt={pinTitle} icon={new L.Icon.Default()} />
      {hasDevice && (
        <>
          {device.accuracyM != null && (
            <Circle center={[device.lat, device.lng]} radius={device.accuracyM} pathOptions={{ color: "#A63C38", weight: 1, fillOpacity: 0.1 }} />
          )}
          <CircleMarker center={[device.lat, device.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: "#A63C38", fillOpacity: 1 }} />
          <Polyline positions={points} pathOptions={{ color: "#142B28", weight: 2, dashArray: "6 6" }} />
        </>
      )}
      <Fit points={points} />
    </MapView>
  );
}
