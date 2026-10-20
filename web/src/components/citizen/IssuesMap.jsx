// Map of the citizen's own and supported issues (exact locations: they reported or follow them).
import { Link } from "react-router";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useTranslation } from "react-i18next";
import "../MapView.jsx"; // Leaflet CSS + default marker icons
import { SANGLI_CENTER } from "../../lib/serviceArea.js";
import { useCategoryName } from "./CategoryIcon.jsx";
import { StatusBadge } from "../StatusBadge.jsx";

export default function IssuesMap({ issues }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const withLocation = issues.filter((i) => i.location);
  const bounds = withLocation.length > 1 ? withLocation.map((i) => [i.location.lat, i.location.lng]) : undefined;
  const center = withLocation[0]?.location ?? SANGLI_CENTER;

  return (
    <div role="region" aria-label={t("map.label")} className="isolate h-[60dvh] min-h-80 overflow-hidden rounded-card border border-stone-300">
      <MapContainer center={[center.lat, center.lng]} zoom={14} bounds={bounds} boundsOptions={{ padding: [40, 40] }} className="size-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withLocation.map((i) => (
          <Marker key={i.id} position={[i.location.lat, i.location.lng]} title={categoryName(i.category)} alt={categoryName(i.category)}>
            <Popup>
              <div className="space-y-1.5 font-sans">
                <p className="text-label text-charcoal-900">{categoryName(i.category)}</p>
                <StatusBadge status={i.status} rejectionType={i.rejectionType} />
                <p className="line-clamp-2 text-caption text-charcoal-900">{i.description}</p>
                <Link to={`/citizen/issues/${i.id}`} className="text-label text-teal-700 underline">
                  {t("map.open")}
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
