import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/index.js";
import { cx } from "../lib/cx.js";

/**
 * Segmented en / हिंदी / मराठी switch. Language names are shown in their own script (not translated).
 * tone="dark" for use on forest-900 surfaces.
 */
export function LanguageSwitcher({ tone = "light", className }) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage;

  // Radio-group keys: arrows move and select; only the selected option is in the Tab order.
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = LANGUAGES.findIndex((l) => l.code === current);
    const next = LANGUAGES[(i + step + LANGUAGES.length) % LANGUAGES.length];
    i18n.changeLanguage(next.code);
    e.currentTarget.querySelector(`[lang="${next.code}"]`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      onKeyDown={onKeyDown}
      aria-label={t("language.label")}
      className={cx(
        "inline-flex rounded-full border p-1",
        tone === "dark" ? "border-ivory-50/20 bg-ivory-50/10" : "border-stone-300 bg-white",
        className,
      )}
    >
      {LANGUAGES.map((lang) => {
        const active = lang.code === current;
        return (
          <button
            key={lang.code}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            lang={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={cx(
              "min-h-11 min-w-16 rounded-full px-4 text-label transition-colors",
              active
                ? tone === "dark"
                  ? "bg-brass-400 text-forest-900"
                  : "bg-forest-900 text-ivory-50"
                : tone === "dark"
                  ? "text-ivory-50 hover:bg-ivory-50/10"
                  : "text-graphite-600 hover:text-charcoal-900",
            )}
          >
            {lang.nativeName}
          </button>
        );
      })}
    </div>
  );
}
