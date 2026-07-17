import "server-only";

import {
  convert,
  MEASUREMENT_TYPES,
  type MeasurementType,
  type MeasurementUnit,
} from "@/entities/measurement/model/measurement-types";
import { createClient } from "@/shared/lib/supabase/server";

export type MeasurementPoint = { id: string; value: number; measuredAt: string };

export type MeasurementSeries = {
  type: MeasurementType;
  /** The unit the whole series is expressed in — the most recent entry's unit. */
  unit: MeasurementUnit;
  /** Oldest to newest: the order a time chart plots. */
  points: MeasurementPoint[];
  latest: number;
  first: number;
};

/**
 * Every measurement the user has logged, grouped into one series per type.
 *
 * Only types with data appear, in the catalogue's display order. Within a type,
 * points are normalised to the newest entry's unit so a single line is coherent
 * even if they once logged in lbs and now in kg -- the chart reads in the unit
 * they currently use.
 *
 * RLS scopes the rows to the signed-in user; no user filter here.
 */
export async function getMeasurementSeries(): Promise<MeasurementSeries[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("body_measurements")
    .select("id, type, value, unit, measured_at")
    .order("measured_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load measurements: ${error.message}`);
  }

  // Group by type, preserving the ascending (oldest-first) order.
  const byType = new Map<MeasurementType, { id: string; value: number; unit: MeasurementUnit; measuredAt: string }[]>();
  for (const row of data) {
    const list = byType.get(row.type) ?? [];
    list.push({ id: row.id, value: row.value, unit: row.unit, measuredAt: row.measured_at });
    byType.set(row.type, list);
  }

  const series: MeasurementSeries[] = [];

  // MEASUREMENT_TYPES order, so weight leads and the charts are stably ordered.
  for (const { value: type } of MEASUREMENT_TYPES) {
    const rows = byType.get(type);
    if (!rows || rows.length === 0) continue;

    // Newest entry's unit is the series unit; convert the rest to match.
    const unit = rows[rows.length - 1].unit;
    const points: MeasurementPoint[] = rows.map((r) => ({
      id: r.id,
      value: convert(r.value, r.unit, unit),
      measuredAt: r.measuredAt,
    }));

    series.push({
      type,
      unit,
      points,
      latest: points[points.length - 1].value,
      first: points[0].value,
    });
  }

  return series;
}

/** The most recent entry for one type, or null. Used for the coach's context. */
export async function getLatestMeasurement(
  type: MeasurementType,
): Promise<{ value: number; unit: MeasurementUnit; measuredAt: string } | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("body_measurements")
    .select("value, unit, measured_at")
    .eq("type", type)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? { value: data.value, unit: data.unit, measuredAt: data.measured_at } : null;
}
