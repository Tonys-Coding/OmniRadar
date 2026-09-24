import { useId } from "react";

/** OmniRadar mark: a four-point star in a blue disc. */
export function BrandMark({ className }: { className?: string }) {
  // Unique per instance: a gradient defined inside a hidden copy (e.g. the
  // desktop sidebar on mobile) can't be referenced by a visible one.
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#8DB2FF" />
          <stop offset="1" stopColor="#4A7FF5" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${id})`} />
      <path d="M32 10c1.6 11.4 10.6 20.4 22 22-11.4 1.6-20.4 10.6-22 22-1.6-11.4-10.6-20.4-22-22 11.4-1.6 20.4-10.6 22-22z" fill="#fff" />
    </svg>
  );
}
