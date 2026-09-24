import { colorAt } from "@/lib/categories-ui";

/** Segmented bar like the "Asset Allocation" reference. */
export function AllocationBar({ values, className }: { values: number[]; className?: string }) {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return <div className={`h-3.5 rounded-full bg-surface ${className ?? ""}`} />;
  return (
    <div className={`flex h-3.5 gap-1 ${className ?? ""}`} role="img" aria-label="Share of total by category">
      {values.map((v, i) =>
        v > 0 ? (
          <div
            key={i}
            className="h-full rounded-[5px] first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: v / total, flexBasis: 0, minWidth: 6, background: colorAt(i) }}
          />
        ) : null,
      )}
    </div>
  );
}
