import type { Metadata } from "next";
import Link from "next/link";

import { listExercises } from "@/entities/exercise/api/exercise-queries";
import type { Enums } from "@/shared/types/database.types";
import { ButtonLink } from "@/shared/ui/button";
import { ExerciseImage } from "@/shared/ui/exercise-image";

export const metadata: Metadata = { title: "Exercises" };

/**
 * Filter chips are muscle *groups*, not single enum values.
 *
 * People shop for "back exercises"; the anatomy underneath is lats, traps, and
 * the lower and middle back. Mapping a chip to one enum value made the back
 * chip return nothing at all, because the catalogue never tags anything with a
 * bare BACK -- it is always specific.
 */
const FILTER_GROUPS: { slug: string; label: string; muscles: Enums<"muscle_group">[] }[] = [
  { slug: "chest", label: "Chest", muscles: ["CHEST"] },
  // BACK stays in the list for rows imported from the workout-cool CSV, which
  // does use the generic value.
  { slug: "back", label: "Back", muscles: ["LATS", "MIDDLE_BACK", "LOWER_BACK", "TRAPS", "BACK"] },
  { slug: "shoulders", label: "Shoulders", muscles: ["SHOULDERS"] },
  { slug: "arms", label: "Arms", muscles: ["BICEPS", "TRICEPS", "FOREARMS"] },
  { slug: "legs", label: "Legs", muscles: ["QUADRICEPS", "HAMSTRINGS", "CALVES"] },
  { slug: "glutes", label: "Glutes", muscles: ["GLUTES"] },
  { slug: "core", label: "Core", muscles: ["ABDOMINALS", "OBLIQUES"] },
];

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ muscle?: string; q?: string; page?: string }>;
}) {
  const { muscle, q, page } = await searchParams;

  // Resolve the URL against the known groups rather than passing it through: an
  // unrecognised value falls back to "all" instead of reaching Postgres and
  // failing an enum cast.
  const selected = FILTER_GROUPS.find((g) => g.slug === muscle);

  const { exercises, total, page: current, pageCount } = await listExercises({
    search: q,
    muscles: selected?.muscles,
    // Number("abc") is NaN and Number("") is 0; both fall back to page 1.
    page: Number(page) || 1,
  });

  // Carries the active filter and search across page links, so paging does not
  // silently reset them.
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (muscle) params.set("muscle", muscle);
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/exercises?${query}` : "/exercises";
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Exercises</h1>
      <p className="mt-1 text-sm text-muted">Browse the catalogue. No account needed.</p>

      <form className="mt-8 mb-6">
        {/* Keeps the active filter when searching. Submitting drops ?page,
            which is what we want -- page 4 of the old result set is
            meaningless against a new one. */}
        {muscle ? <input type="hidden" name="muscle" value={muscle} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search exercises…"
          aria-label="Search exercises"
          className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={q ? `/exercises?q=${encodeURIComponent(q)}` : "/exercises"}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            selected ? "border-border text-muted hover:text-foreground" : "border-accent text-accent"
          }`}
        >
          All
        </Link>
        {FILTER_GROUPS.map((group) => {
          // No page param: changing the filter starts over at page 1.
          const params = new URLSearchParams({ muscle: group.slug });
          if (q) params.set("q", q);
          return (
            <Link
              key={group.slug}
              href={`/exercises?${params}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected?.slug === group.slug
                  ? "border-accent text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {group.label}
            </Link>
          );
        })}
      </div>

      <p className="mb-6 text-sm text-muted">
        <span className="numeric">{total.toLocaleString("en-US")}</span>
        {total === 1 ? " exercise" : " exercises"}
        {pageCount > 1 ? (
          <>
            {" · page "}
            <span className="numeric">{current}</span>
            {" of "}
            <span className="numeric">{pageCount}</span>
          </>
        ) : null}
      </p>

      {exercises.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">
            {q || selected
              ? "No exercises match that filter."
              : "The catalogue is empty — import it first, see the README."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <Link
                href={`/exercises/${exercise.slug}`}
                className="flex gap-4 overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-muted"
              >
                {exercise.image_urls[0] ? (
                  <ExerciseImage
                    src={exercise.image_urls[0]}
                    alt=""
                    width={96}
                    height={96}
                    // Decorative: the exercise name next to it already names
                    // the link, so alt text would just be read twice.
                    aria-hidden
                    className="h-24 w-24 shrink-0 object-cover"
                  />
                ) : (
                  <div className="h-24 w-24 shrink-0 bg-surface-raised" aria-hidden />
                )}
                <div className="min-w-0 self-center py-4 pr-4">
                  <p className="truncate font-semibold">{exercise.name}</p>
                  <p className="mt-1.5 text-xs capitalize text-muted">
                    {exercise.primary_muscles.map(label).join(", ") || "—"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
          {/* Rendered as a span, not a disabled link, at the ends: a link to
              nowhere is still focusable and still announced as a link. */}
          {current > 1 ? (
            <ButtonLink href={pageHref(current - 1)} variant="secondary" rel="prev">
              ← Previous
            </ButtonLink>
          ) : (
            <span aria-hidden />
          )}

          <span className="numeric text-sm text-muted">
            {current} / {pageCount}
          </span>

          {current < pageCount ? (
            <ButtonLink href={pageHref(current + 1)} variant="secondary" rel="next">
              Next →
            </ButtonLink>
          ) : (
            <span aria-hidden />
          )}
        </nav>
      ) : null}
    </main>
  );
}
