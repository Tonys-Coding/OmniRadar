import { colorAt } from "@/lib/categories-ui";
import { percent } from "@/lib/format";

/**
 * Segmented bar like the "Asset Allocation" reference. The visible legend next
 * to it carries the numbers; `label` names what the bar splits for screen
 * readers ("Cash by account").
 */
export function AllocationBar({ values, label, className }: { values: number[]; label: string; className?: string }) {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return <div className={`h-3.5 rounded-full bg-surface ${className ?? ""}`} role="img" aria-label={`${label}: nothing yet`} />;
  const shares = values.filter((v) => v > 0).map((v) => percent(v / total));
  return (
    <div className={`flex h-3.5 gap-1 ${className ?? ""}`} role="img" aria-label={`${label}: ${shares.join(", ")}`}>
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
