import type { Enums } from "@/shared/types/database.types";

export type MeasurementType = Enums<"measurement_type">;
export type MeasurementUnit = Enums<"measurement_unit">;

/**
 * The measurement kinds, their display names, and the units each accepts (first
 * is the default). The database enforces neither the label nor which units suit
 * which type -- that lives here, so a new kind is one row plus an enum value.
 *
 * Ordered by how often people track them: weight and body fat lead, then
 * circumferences roughly head to toe.
 */
export const MEASUREMENT_TYPES: {
  value: MeasurementType;
  label: string;
  units: MeasurementUnit[];
}[] = [
  { value: "WEIGHT", label: "Weight", units: ["kg", "lbs"] },
  { value: "BODY_FAT", label: "Body fat", units: ["percent"] },
  { value: "NECK", label: "Neck", units: ["cm", "in"] },
  { value: "SHOULDERS", label: "Shoulders", units: ["cm", "in"] },
  { value: "CHEST", label: "Chest", units: ["cm", "in"] },
  { value: "ARM", label: "Arm", units: ["cm", "in"] },
  { value: "FOREARM", label: "Forearm", units: ["cm", "in"] },
  { value: "WAIST", label: "Waist", units: ["cm", "in"] },
  { value: "HIP", label: "Hips", units: ["cm", "in"] },
  { value: "THIGH", label: "Thigh", units: ["cm", "in"] },
  { value: "CALF", label: "Calf", units: ["cm", "in"] },
];

const BY_TYPE = new Map(MEASUREMENT_TYPES.map((m) => [m.value, m]));

export const MEASUREMENT_LABEL: Record<MeasurementType, string> = Object.fromEntries(
  MEASUREMENT_TYPES.map((m) => [m.value, m.label]),
) as Record<MeasurementType, string>;

export function unitsFor(type: MeasurementType): MeasurementUnit[] {
  return BY_TYPE.get(type)?.units ?? ["kg"];
}

export function defaultUnit(type: MeasurementType): MeasurementUnit {
  return unitsFor(type)[0];
}

/** How a unit reads next to a number: "%" hugs, the rest get a space. */
export function formatUnit(unit: MeasurementUnit): string {
  return unit === "percent" ? "%" : unit;
}

/** "72.5 kg", "18%", "34 cm" — value plus its unit, spaced correctly. */
export function formatValue(value: number, unit: MeasurementUnit): string {
  const n = Math.round(value * 10) / 10;
  return unit === "percent" ? `${n}%` : `${n} ${unit}`;
}

const LBS_PER_KG = 1 / 0.453_592_37;
const IN_PER_CM = 1 / 2.54;

/**
 * Converts a value between units of the same measure so a single line can plot
 * points a user logged in different units. Cross-measure conversions (kg→cm)
 * have no meaning and return the value unchanged -- callers only ever convert
 * within one measurement type.
 */
export function convert(value: number, from: MeasurementUnit, to: MeasurementUnit): number {
  if (from === to) return value;
  if (from === "kg" && to === "lbs") return value * LBS_PER_KG;
  if (from === "lbs" && to === "kg") return value * 0.453_592_37;
  if (from === "cm" && to === "in") return value * IN_PER_CM;
  if (from === "in" && to === "cm") return value * 2.54;
  return value;
}
