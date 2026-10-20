// Citizen and contractor screens are phone designs (DESIGN.md: mobile-first; Stitch: a constrained
// 480 px application viewport on wide screens). On a wide screen the whole app — header, content,
// bottom navigation — stays in one centred column with Warm Ivory around it. Admin is not wrapped.
//
// Inside the column, screen-width breakpoints (sm:, md:) would still fire on a laptop, so citizen and
// contractor code uses none; shared components use container queries (@lg:, @2xl:) instead, which
// follow this column's width.
import { Outlet } from "react-router";

export const MOBILE_COLUMN_MAX = 480;

export function MobileColumn({ children }) {
  return (
    <div className="min-h-dvh bg-ivory-50">
      <div
        data-mobile-column
        className="@container relative mx-auto min-h-dvh w-full max-w-[480px] bg-ivory-50 sm:border-x sm:border-stone-300"
      >
        {children ?? <Outlet />}
      </div>
    </div>
  );
}
