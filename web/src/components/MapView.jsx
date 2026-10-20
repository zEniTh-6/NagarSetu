// Leaflet + OpenStreetMap wrapper for the report and map screens (later phases).
// Location search (Nominatim) must run on Enter/button press only, never as-you-type.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer } from "react-leaflet";
import { useTranslation } from "react-i18next";

// Bundlers break Leaflet's default icon URLs; point them at the bundled files.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

/** Centre of the service area (SMKC bounding box, D-012). */
export const SANGLI_CENTER = [16.8352, 74.5998];

export function MapView({ center = SANGLI_CENTER, zoom = 14, className = "h-72", children, label }) {
  const { t } = useTranslation();
  return (
    <div role="region" aria-label={label ?? t("map.label")} className={["overflow-hidden rounded-card border border-stone-300", className].join(" ")}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className="size-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {children}
      </MapContainer>
    </div>
  );
}
