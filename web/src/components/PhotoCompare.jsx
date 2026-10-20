import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Before / after photos side by side (stacked on small screens).
 * before / after: { src, alt, time?, caption? }. A missing `after` shows a placeholder.
 */
export function PhotoCompare({ before, after, className }) {
  const { t } = useTranslation();
  return (
    <div className={["grid gap-4 sm:grid-cols-2", className].filter(Boolean).join(" ")}>
      <Photo label={t("photo.before")} photo={before} />
      <Photo label={t("photo.after")} photo={after} emptyText={t("photo.afterPending")} verified />
    </div>
  );
}

function Photo({ label, photo, emptyText, verified }) {
  return (
    <figure className="m-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-stone-300 bg-ivory-50">
        {photo?.src ? (
          <img src={photo.src} alt={photo.alt ?? ""} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-graphite-600">
            <ImageOff aria-hidden="true" className="size-8" />
            <span className="text-caption">{emptyText}</span>
          </div>
        )}
        <span
          className={[
            "absolute start-3 top-3 rounded-full px-2.5 py-1 text-eyebrow uppercase",
            verified && photo?.src ? "bg-forest-900 text-brass-400" : "bg-forest-900 text-ivory-50",
          ].join(" ")}
        >
          {label}
        </span>
        {photo?.time && (
          <span className="tnum absolute inset-x-0 bottom-0 bg-forest-900/80 px-3 py-1.5 text-caption text-ivory-50">
            {photo.time}
          </span>
        )}
      </div>
      {photo?.caption && <figcaption className="mt-2 text-caption text-graphite-600">{photo.caption}</figcaption>}
    </figure>
  );
}
