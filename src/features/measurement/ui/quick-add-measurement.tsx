"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  defaultUnit,
  formatUnit,
  MEASUREMENT_TYPES,
  unitsFor,
  type MeasurementType,
  type MeasurementUnit,
} from "@/entities/measurement/model/measurement-types";
import { logMeasurement } from "@/features/measurement/api/measurement-actions";
import { Button } from "@/shared/ui/button";

/** One fast row: pick what, type the number, tap Log. Weight is the default. */
export function QuickAddMeasurement() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<MeasurementType>("WEIGHT");
  const [unit, setUnit] = useState<MeasurementUnit>(defaultUnit("WEIGHT"));
  const [value, setValue] = useState("");

  const units = unitsFor(type);

  function changeType(next: MeasurementType) {
    setType(next);
    // A waist can't stay in kg — snap to a unit the new measure accepts.
    setUnit(defaultUnit(next));
  }

  function log() {
    const parsed = Number(value.replace(",", "."));
    if (!value.trim() || Number.isNaN(parsed)) {
      setError("Enter a number.");
      return;
    }
    startTransition(async () => {
      const result = await logMeasurement(type, parsed, unit);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setValue("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Measurement</span>
          <select
            value={type}
            onChange={(event) => changeType(event.target.value as MeasurementType)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            {MEASUREMENT_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Value</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") log();
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label={`New ${type.toLowerCase()} value`}
            className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>

        {units.length > 1 ? (
          <div className="flex overflow-hidden rounded-lg border border-border">
            {units.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={unit === u ? "bg-accent/10 px-3 py-2 text-sm" : "px-3 py-2 text-sm text-muted"}
              >
                {formatUnit(u)}
              </button>
            ))}
          </div>
        ) : (
          <span className="px-1 py-2 text-sm text-muted">{formatUnit(unit)}</span>
        )}

        <Button onClick={log} disabled={isPending}>
          {isPending ? "…" : "Log"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
