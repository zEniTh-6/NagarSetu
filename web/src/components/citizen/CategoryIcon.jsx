import { Lightbulb, TrafficCone, Trash2, CircleDot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "../../lib/cx.js";

// DESIGN.md category accents: Roads teal, Garbage clay, Streetlight brass. Line icon on a tinted tile.
const CATEGORY = {
  ROADS: { icon: TrafficCone, tile: "bg-sage-100 text-cat-roads" },
  GARBAGE: { icon: Trash2, tile: "bg-clay-50 text-cat-garbage" },
  STREETLIGHT: { icon: Lightbulb, tile: "bg-brass-50 text-cat-streetlight" },
};

export function CategoryTile({ categoryKey, size = "md", className }) {
  const c = CATEGORY[categoryKey] ?? { icon: CircleDot, tile: "bg-sage-100 text-sage-600" };
  const Icon = c.icon;
  return (
    <span
      aria-hidden="true"
      className={cx("flex shrink-0 items-center justify-center rounded-control", size === "lg" ? "size-12" : "size-10", c.tile, className)}
    >
      <Icon className={size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}

/** Category name in the user's language (server names are English). */
export function useCategoryName() {
  const { t } = useTranslation();
  return (category) => (category ? t(`category.${category.key ?? category}`, { defaultValue: category.name ?? String(category) }) : "");
}
