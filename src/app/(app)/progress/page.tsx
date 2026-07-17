import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getMeasurementSeries } from "@/entities/measurement/api/measurement-queries";
import { formatValue, MEASUREMENT_LABEL } from "@/entities/measurement/model/measurement-types";
import { LineChart } from "@/features/measurement/ui/line-chart";
import { QuickAddMeasurement } from "@/features/measurement/ui/quick-add-measurement";
import { createClient } from "@/shared/lib/supabase/server";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/progress");

  const series = await getMeasurementSeries();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Log a measurement and watch it move. Weight, body fat, or any circumference — each
        keeps its own history.
      </p>

      <QuickAddMeasurement />

      {series.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">
            Nothing logged yet. Add your first measurement above — a weigh-in is a good start.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {series.map((s) => {
            const change = s.latest - s.first;
            const many = s.points.length > 1;
            return (
              <section key={s.type}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-semibold">{MEASUREMENT_LABEL[s.type]}</h2>
                  <p className="text-sm">
                    <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatValue(s.latest, s.unit)}
                    </span>
                    {many && change !== 0 ? (
                      <span className="ml-2 text-xs text-muted">
                        {change > 0 ? "+" : ""}
                        {Math.round(change * 10) / 10} since start
                      </span>
                    ) : null}
                  </p>
                </div>
                <LineChart points={s.points} unit={s.unit} />
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
