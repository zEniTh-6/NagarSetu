// Contractor frame (design/mockups/contractor): app bar and a bottom navigation on phones
// (My jobs, Alerts, Profile); the same links sit in the app bar on wider screens.
import { NavLink, Outlet } from "react-router";
import { Bell, BriefcaseBusiness, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "../Logo.jsx";
import { cx } from "../../lib/cx.js";
import { useNotifications } from "../citizen/useNotifications.js";

const NAV = [
  { to: "/contractor", end: true, icon: BriefcaseBusiness, key: "jobs" },
  { to: "/contractor/notifications", icon: Bell, key: "alerts", badge: true },
  { to: "/contractor/profile", icon: UserRound, key: "profile" },
];

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

export function ContractorLayout() {
  const { t } = useTranslation();
  const unread = useNotifications().data?.unread ?? 0;
  return (
    <div className="min-h-dvh bg-ivory-50 pb-24 md:pb-0">
      <header className="on-dark sticky top-0 z-30 border-b border-forest-900/10 bg-forest-900 text-ivory-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 md:px-8">
          <NavLink to="/contractor" aria-label={t("contractor.nav.jobs")} className="rounded-control">
            <Logo tone="dark" caption={false} />
          </NavLink>
          <nav aria-label={t("nav.main")} className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx("relative inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-label", isActive ? "bg-ivory-50/15 text-ivory-50" : "text-sage-100 hover:bg-ivory-50/10")
                }
              >
                <span className="relative">
                  <item.icon aria-hidden="true" className="size-5" />
                  {item.badge && <Badge count={unread} />}
                </span>
                {t(`contractor.nav.${item.key}`)}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <Outlet />
      </main>
      <nav aria-label={t("nav.main")} className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-300 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {NAV.map((item) => (
            <li key={item.key} className="flex justify-center">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => cx("flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[12px] font-semibold", isActive ? "text-teal-700" : "text-graphite-600")}
              >
                <span className="relative">
                  <item.icon aria-hidden="true" className="size-6" />
                  {item.badge && <Badge count={unread} />}
                </span>
                {t(`contractor.nav.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
