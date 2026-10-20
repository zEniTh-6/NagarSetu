import { cx } from "../lib/cx.js";

/** Shared pill shape for status badges, flags, priorities and AI verdicts. Always text + icon. */
export function Pill({ icon: Icon, className, children, title, ...rest }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold",
        className,
      )}
      {...rest}
    >
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.25} />}
      <span>{children}</span>
    </span>
  );
}
