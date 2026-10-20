// Citizen frame: app bar (wordmark, profile) and the bottom navigation, inside MobileColumn.
import { NavLink, Outlet } from "react-router";
import { ArrowLeft, Bell, Camera, ClipboardList, House, Map as MapIcon, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "../Logo.jsx";
import { cx } from "../../lib/cx.js";
import { useNotifications } from "./useNotifications.js";

function Badge({ count }) {
  const { t } = useTranslation();
  if (!count) return null;
  return (
    <span className="tnum absolute -end-1.5 -top-1 min-w-5 rounded-full bg-error px-1 text-center text-[11px] leading-5 font-bold text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {t("nav.unread", { count })}</span>
    </span>
  );
}

const NAV = [
  { to: "/citizen", end: true, icon: House, key: "home" },
  { to: "/citizen/map", icon: MapIcon, key: "map" },
  { to: "/citizen/report", icon: Camera, key: "report", primary: true },
  { to: "/citizen/complaints", icon: ClipboardList, key: "complaints" },
  { to: "/citizen/notifications", icon: Bell, key: "alerts", badge: true },
];

export function CitizenLayout() {
  const { t } = useTranslation();
  const unread = useNotifications().data?.unread ?? 0;

  return (
    <div className="min-h-dvh bg-ivory-50 pb-24">
      <header className="on-dark sticky top-0 z-30 border-b border-forest-900/10 bg-forest-900 text-ivory-50">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <NavLink to="/citizen" aria-label={t("nav.home")} className="rounded-control">
            <Logo tone="dark" caption={false} />
          </NavLink>
          <NavLink
            to="/citizen/profile"
            className={({ isActive }) =>
              cx("tap inline-flex items-center justify-center rounded-full", isActive ? "bg-ivory-50/15" : "hover:bg-ivory-50/10")
            }
            aria-label={t("nav.profile")}
          >
            <UserRound aria-hidden="true" className="size-6" />
          </NavLink>
        </div>
      </header>

      <main className="px-4 py-5">
        <Outlet />
      </main>

      <nav
        aria-label={t("nav.main")}
        /* Fixed to the viewport but as wide as MobileColumn (centred, same max width). */
        className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] border-t border-stone-300 bg-white pb-[env(safe-area-inset-bottom)] sm:border-x"
      >
        <ul className="grid grid-cols-5">
          {NAV.map((item) => (
            <li key={item.key} className="flex justify-center">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx(
                    "flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[12px] font-semibold",
                    isActive ? "text-teal-700" : "text-graphite-600",
                  )
                }
              >
                {item.primary ? (
                  <span className="-mt-7 flex size-14 items-center justify-center rounded-full border-4 border-white bg-teal-700 text-white">
                    <item.icon aria-hidden="true" className="size-6" />
                  </span>
                ) : (
                  <span className="relative">
                    <item.icon aria-hidden="true" className="size-6" />
                    {item.badge && <Badge count={unread} />}
                  </span>
                )}
                {t(`nav.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Full-screen sub-flow (report, retake, not fixed): back link + title, no bottom navigation. */
export function FlowHeader({ title, subtitle, onBack, backTo, step, steps }) {
  const { t } = useTranslation();
  const BackTag = onBack ? "button" : NavLink;
  const backProps = onBack ? { type: "button", onClick: onBack } : { to: backTo ?? "/citizen" };
  return (
    <header className="sticky top-0 z-30 border-b border-stone-300 bg-white">
      <div className="flex items-center gap-2 px-2 py-2">
        <BackTag {...backProps} className="tap inline-flex items-center justify-center rounded-control text-forest-900 hover:bg-ivory-50" aria-label={t("common.back")}>
          <ArrowLeft aria-hidden="true" className="size-6" />
        </BackTag>
        <div className="min-w-0">
          <h1 className="truncate text-h3 text-charcoal-900">{title}</h1>
          {subtitle && <p className="truncate text-caption text-graphite-600">{subtitle}</p>}
        </div>
      </div>
      {steps && (
        <div className="px-4 pb-3">
          <p className="mb-1.5 text-caption font-semibold text-graphite-600">{t("report.stepOf", { step, total: steps })}</p>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className={cx("h-1.5 flex-1 rounded-full", i < step ? "bg-teal-700" : "bg-stone-300")} />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
