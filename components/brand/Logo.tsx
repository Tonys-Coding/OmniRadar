// Plain helper (not imported from the client-only ui module) so the logo can
// render in server components too.
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// OmniRadar logo: a radar ring (open at the lower left) with a teal sweep arc
// and three teal blips, plus the "OmniRadar" wordmark in the site font
// (Outfit SemiBold). Geometry matches scripts/brand/build_brand.py, which
// generates the standalone transparent files in public/brand/.
//
// The ring uses currentColor: navy on light surfaces, white on dark ones.

const TEAL = "#6FD3D5";

export function LogoMark({ className, title = "OmniRadar" }: { className?: string; title?: string | null }) {
  return (
    <svg
      viewBox="-72 -72 144 144"
      className={cx("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
    >
      <path d="M-52.23 35.23A63 63 0 1 1 -32.45 54" fill="none" stroke="currentColor" strokeWidth={16.5} strokeLinecap="round" />
      <path d="M-38.53 14.02A41 41 0 0 1 4.29 -40.78" fill="none" stroke={TEAL} strokeWidth={14.5} strokeLinecap="round" />
      <circle cx={34.6} cy={16.3} r={8} fill={TEAL} />
      <circle cx={-15} cy={31.5} r={8} fill={TEAL} />
      <circle cx={3.5} cy={-5.4} r={8} fill={TEAL} />
    </svg>
  );
}

/**
 * Mark + wordmark. Size it with `className` (font-size); the mark scales with
 * the text, keeping the original lockup proportions.
 */
export function Logo({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[0.3em] leading-none font-semibold tracking-[-0.01em]",
        tone === "dark" ? "text-white" : "text-logo-navy",
        className,
      )}
      aria-label="OmniRadar"
      role="img"
      translate="no"
    >
      <LogoMark title={null} className="size-[1.45em]" />
      <span aria-hidden="true">OmniRadar</span>
    </span>
  );
}
