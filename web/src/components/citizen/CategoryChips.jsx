// Category filter chips (feed and map). One choice at a time; the chosen chip uses the shared
// selected style (D-024): 2 px Deep Teal border, Sage Tint, check icon, bold label.
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { categoriesApi, qk } from "../../api/citizen.js";
import { cx } from "../../lib/cx.js";
import { useCategoryName } from "./CategoryIcon.jsx";

/** value: category key or null (= all). */
export function CategoryChips({ value, onChange, className }) {
  const { t } = useTranslation();
  const categoryName = useCategoryName();
  const categories = useQuery({ queryKey: qk.categories, queryFn: () => categoriesApi.list().then((r) => r.categories), staleTime: Infinity });
  const options = [{ key: null, label: t("feed.all") }, ...(categories.data ?? []).map((c) => ({ key: c.key, label: categoryName(c) }))];

  return (
    <div role="group" aria-label={t("feed.filterLabel")} className={cx("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0", className)}>
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <button
            key={o.key ?? "ALL"}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.key)}
            className={cx(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full text-label transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
              selected ? "border-2 border-teal-700 bg-sage-100 px-[15px] font-bold text-charcoal-900" : "border border-stone-300 bg-white px-4 font-medium text-graphite-600 hover:bg-ivory-50",
            )}
          >
            {selected && <Check aria-hidden="true" className="size-4 text-teal-700" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
