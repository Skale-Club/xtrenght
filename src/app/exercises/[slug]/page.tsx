import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getExerciseBySlug } from "@/entities/exercise/api/exercise-queries";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const exercise = await getExerciseBySlug(slug);

  return { title: exercise?.name ?? "Exercise" };
}

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function Tags({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-border px-2.5 py-1 text-xs capitalize text-foreground"
          >
            {label(value)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function ExercisePage({ params }: PageProps) {
  const { slug } = await params;
  const exercise = await getExerciseBySlug(slug);

  if (!exercise) {
    notFound();
  }

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{exercise.name}</h1>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Tags title="Primary muscles" values={exercise.primary_muscles} />
          <Tags title="Secondary muscles" values={exercise.secondary_muscles} />
          <Tags title="Equipment" values={exercise.equipment} />
          <Tags title="Type" values={exercise.exercise_types} />
        </div>

        {exercise.introduction ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">Introduction</h2>
            {/*
             * The source dataset ships HTML. This is trusted, admin-curated
             * content -- if user-submitted exercises are ever added, this must
             * be sanitised before it renders.
             */}
            <div
              className="flex flex-col gap-3 leading-relaxed text-muted"
              dangerouslySetInnerHTML={{ __html: exercise.introduction }}
            />
          </section>
        ) : null}

        {exercise.description ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">How to perform</h2>
            <div
              className="flex flex-col gap-3 leading-relaxed text-muted"
              dangerouslySetInnerHTML={{ __html: exercise.description }}
            />
          </section>
        ) : null}
      </main>
    </>
  );
}
