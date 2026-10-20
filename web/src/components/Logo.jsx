import { useTranslation } from "react-i18next";
import { cx } from "../lib/cx.js";

/** Bridge mark ("setu"). Not a government emblem or seal (DESIGN.md: no emblems). */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M4 20h24M7 20v4M25 20v4M7 20Q16 4 25 20M12 20v-6M16 20v-8M20 20v-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Wordmark: lowercase "nagarsetu", Devanagari name, caption. tone="dark" on forest surfaces. */
export function Logo({ tone = "light", caption = true, className }) {
  const { t } = useTranslation();
  const dark = tone === "dark";
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <span
        className={cx(
          "flex size-11 shrink-0 items-center justify-center rounded-control",
          dark ? "bg-brass-400 text-forest-900" : "bg-forest-900 text-brass-400",
        )}
      >
        <LogoMark className="size-7" />
      </span>
      <span className="min-w-0">
        <span className={cx("flex items-baseline gap-2 text-h2 leading-tight", dark ? "text-ivory-50" : "text-forest-900")}>
          <span className="font-bold tracking-tight">nagarsetu</span>
          <span lang="mr" className={cx("text-label font-medium", dark ? "text-sage-100" : "text-graphite-600")}>
            नगरसेतू
          </span>
        </span>
        {caption && (
          <span className={cx("block text-eyebrow uppercase", dark ? "text-brass-400" : "text-brass-700")}>
            {t("brand.caption")}
          </span>
        )}
      </span>
    </div>
  );
}
