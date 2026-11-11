/** Steps of the sale with how many visits reached each, and how many dropped off before the next. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value ?? 0;
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => {
        const share = top ? (step.value / top) * 100 : 0;
        const prev = i > 0 ? steps[i - 1]!.value : null;
        const kept = prev ? Math.round((step.value / prev) * 100) : null;
        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">
                {i + 1}. {step.label}
              </span>
              <span className="tabular-nums">
                <strong>{step.value.toLocaleString("en-IN")}</strong>
                <span className="text-muted"> · {top ? `${Math.round(share * 10) / 10}%` : "-"}</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${step.value > 0 ? Math.max(share, 1.5) : 0}%` }}
              />
            </div>
            {kept !== null && prev ? (
              <p className="mt-0.5 text-xs text-muted">
                {kept}% of the step before{prev - step.value > 0 ? ` · ${prev - step.value} dropped off` : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
