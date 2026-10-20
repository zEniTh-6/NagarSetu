import { cx } from "../lib/cx.js";

// Level 1: white tile, 1px stone border, 16px radius, no shadow.
// "hero": Midnight Forest panel (ivory text; use brass for accents, never teal).
// "highlight": white tile with a thin brass border for verified / highlighted content.
const VARIANTS = {
  default: "bg-white border border-stone-300 text-charcoal-900",
  hero: "on-dark bg-forest-900 text-ivory-50",
  highlight: "bg-white border border-brass-400 text-charcoal-900",
  muted: "bg-ivory-50 border border-stone-300 text-charcoal-900",
};

export function Card({ as: Tag = "div", variant = "default", padding = "p-4 sm:p-6", className, children, ...rest }) {
  return (
    <Tag className={cx("rounded-card", VARIANTS[variant], padding, className)} {...rest}>
      {children}
    </Tag>
  );
}
