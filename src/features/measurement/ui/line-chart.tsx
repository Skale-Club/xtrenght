"use client";

import { useRef, useState } from "react";

import { formatValue, type MeasurementUnit } from "@/entities/measurement/model/measurement-types";

export type ChartPoint = { value: number; measuredAt: string };

/**
 * A single-series time chart for one body measurement.
 *
 * Single series by design: weight and waist have different scales and never
 * share an axis (the cardinal chart sin), so each measurement gets its own
 * chart. No legend — the caller's heading names what's plotted. The line is the
 * only loud thing; grid and axes stay recessive, text wears text tokens, and the
 * accent hue rides the mark alone.
 *
 * Interactive by default: a crosshair snaps to the nearest point and a tooltip
 * reads out its date and value. A visually-hidden table carries the same data
 * for screen readers and the color-blind case.
 */
const W = 640;
const H = 220;
const M = { top: 16, right: 16, bottom: 28, left: 44 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

function niceBounds(min: number, max: number): [number, number] {
  if (min === max) {
    // A flat series still needs a band to sit in.
    const pad = Math.abs(min) * 0.05 || 1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function LineChart({ points, unit }: { points: ChartPoint[]; unit: MeasurementUnit }) {
  const fmt = (v: number) => formatValue(v, unit);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const times = points.map((p) => new Date(p.measuredAt).getTime());
  const values = points.map((p) => p.value);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const [yMin, yMax] = niceBounds(Math.min(...values), Math.max(...values));

  // A single point has no time span to spread across; park it in the middle.
  const x = (t: number) => (tMax === tMin ? M.left + PLOT_W / 2 : M.left + ((t - tMin) / (tMax - tMin)) * PLOT_W);
  const y = (v: number) => M.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const coords = points.map((p, i) => ({ px: x(times[i]), py: y(p.value), ...p }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.px.toFixed(1)} ${c.py.toFixed(1)}`).join(" ");
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].px.toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} L ${coords[0].px.toFixed(1)} ${(M.top + PLOT_H).toFixed(1)} Z`
      : "";

  // Three rounded gridline values across the range.
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  const last = coords[coords.length - 1];
  const active = hover !== null ? coords[hover] : null;

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Pointer x in the SVG's own coordinate space, then nearest point by px.
    const svgX = ((event.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = Math.abs(coords[i].px - svgX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHover(nearest);
  }

  return (
    <figure className="m-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`Line chart over time, in ${unit}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* Gridlines + y ticks: hairline, one step off the surface, recessive. */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={M.left - 8}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {Math.round(v * 10) / 10}
            </text>
          </g>
        ))}

        {/* Area wash under the line — the series hue at ~10%. */}
        {areaPath ? <path d={areaPath} fill="var(--accent)" opacity={0.1} /> : null}

        {/* The line: 2px, round join/cap, accent. */}
        {coords.length > 1 ? (
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {/* Every point gets a small dot; the endpoint is emphasised with a ring. */}
        {coords.map((c, i) => (
          <circle key={i} cx={c.px} cy={c.py} r={i === coords.length - 1 ? 4 : 2.5} fill="var(--accent)" />
        ))}
        <circle cx={last.px} cy={last.py} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />

        {/* X axis: first and last date, muted. */}
        <text x={M.left} y={H - 8} textAnchor="start" fontSize={11} fill="var(--muted)">
          {formatDate(points[0].measuredAt)}
        </text>
        {points.length > 1 ? (
          <text x={W - M.right} y={H - 8} textAnchor="end" fontSize={11} fill="var(--muted)">
            {formatDate(points[points.length - 1].measuredAt)}
          </text>
        ) : null}

        {/* Hover: crosshair + highlighted point. Tooltip is HTML, below. */}
        {active ? (
          <g>
            <line
              x1={active.px}
              x2={active.px}
              y1={M.top}
              y2={M.top + PLOT_H}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={active.px} cy={active.py} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ) : null}
      </svg>

      {/* Tooltip / readout. Value leads, date follows — the reader has the metric
          and wants the number. Always shows the latest when not hovering. */}
      <figcaption className="mt-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">{active ? formatDate(active.measuredAt) : "Latest"}</span>
        <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmt(active ? active.value : last.value)}
        </span>
      </figcaption>

      {/* Same data, reachable without a pointer. */}
      <table className="sr-only">
        <caption>Measurements in {unit}, oldest first</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{formatDate(p.measuredAt)}</td>
              <td>{fmt(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
