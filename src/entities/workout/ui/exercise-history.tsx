import Link from "next/link";

import type { ExerciseHistory as History } from "@/entities/workout/api/workout-queries";

function formatWeight(kg: number) {
  // Trailing .0 on a round number is noise on a phone screen.
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ExerciseHistoryPanel({ history }: { history: History }) {
  const { entries, personalRecordKg, totalSets } = history;

  if (entries.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Your history</h2>
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted">
            You haven&apos;t logged this one yet. Add it to a workout and it&apos;ll show up here.
          </p>
        </div>
      </section>
    );
  }

  // Bars are relative to the best session, not to zero: at gym weights the
  // interesting variation lives in the top 20%, and a zero-based scale flattens
  // every bar into the same length.
  const maxWeight = Math.max(...entries.map((e) => e.topWeightKg ?? 0));

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">Your history</h2>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Personal record</p>
          <p className="numeric mt-1 text-2xl font-bold">
            {personalRecordKg !== null ? (
              <>
                {formatWeight(personalRecordKg)}
                <span className="ml-1 text-sm font-medium text-muted">kg</span>
              </>
            ) : (
              <span className="text-muted">—</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Sets logged</p>
          <p className="numeric mt-1 text-2xl font-bold">{totalSets}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => {
          const isRecord = personalRecordKg !== null && entry.topWeightKg === personalRecordKg;
          const width = maxWeight > 0 && entry.topWeightKg ? (entry.topWeightKg / maxWeight) * 100 : 0;

          return (
            <li key={entry.sessionId}>
              <Link
                href={`/workout/${entry.sessionId}`}
                className="block rounded-xl border border-border bg-surface p-3 transition-colors hover:border-muted"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">
                    {formatDate(entry.date)}
                    {isRecord ? <span className="ml-2 text-xs text-accent">★ PR</span> : null}
                  </span>
                  <span className="numeric text-sm text-muted">
                    {entry.sets
                      .map((set) => `${set.weightKg ? formatWeight(set.weightKg) : "–"}×${set.reps ?? "–"}`)
                      .join("  ")}
                  </span>
                </div>

                {/* Decorative: the numbers above already state the value. */}
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-raised" aria-hidden>
                  <div
                    className={`h-full rounded-full ${isRecord ? "bg-accent" : "bg-muted"}`}
                    style={{ width: `${Math.max(width, 4)}%` }}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
