import { forwardRef } from "react";
import { Link } from "react-router";
import { LoaderCircle } from "lucide-react";
import { cx } from "../lib/cx.js";

// DESIGN.md: primary = teal on light (white text), brass on dark (forest text); secondary = brass outline;
// destructive = error. 10px radius, min height 48px, label typography.
const VARIANTS = {
  primary: "bg-teal-700 text-white hover:bg-forest-900 active:bg-forest-900 disabled:bg-teal-700",
  secondary:
    "border-[1.5px] border-brass-400 bg-transparent text-charcoal-900 hover:bg-brass-50 active:bg-brass-50",
  outline: "border-[1.5px] border-field-border bg-white text-charcoal-900 hover:bg-ivory-50",
  destructive: "bg-error text-white hover:brightness-90",
  "destructive-outline": "border-[1.5px] border-error bg-white text-error hover:bg-error-tint",
  ghost: "bg-transparent text-teal-700 hover:bg-sage-100",
  dark: "bg-brass-400 text-forest-900 hover:brightness-95",
};

const SIZES = {
  md: "min-h-12 px-5 text-label",
  sm: "min-h-11 px-4 text-label",
};

/** Button, or a router Link styled as one when `to` is given. */
export const Button = forwardRef(function Button(
  { variant = "primary", size = "md", loading = false, fullWidth, leftIcon: Left, rightIcon: Right, to, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const classes = cx(
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors select-none",
    "disabled:cursor-not-allowed disabled:opacity-40",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
  const content = (
    <>
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      ) : (
        Left && <Left aria-hidden="true" className="size-5" />
      )}
      <span>{children}</span>
      {Right && !loading && <Right aria-hidden="true" className="size-5" />}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});
