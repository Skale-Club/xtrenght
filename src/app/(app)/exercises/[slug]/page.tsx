import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getExerciseBySlug, isFavorited } from "@/entities/exercise/api/exercise-queries";
import { getExerciseHistory } from "@/entities/workout/api/workout-queries";
import { ExerciseHistoryPanel } from "@/entities/workout/ui/exercise-history";
import { FavoriteButton } from "@/features/favorites/ui/favorite-button";
import { createClient } from "@/shared/lib/supabase/server";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Both are per-user and meaningless signed out, where RLS returns nothing anyway.
  const [favorited, history] = user
    ? await Promise.all([isFavorited(exercise.id), getExerciseHistory(exercise.id)])
    : [false, null];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{exercise.name}</h1>
        <FavoriteButton
          exerciseId={exercise.id}
          slug={exercise.slug}
          initialFavorited={favorited}
          signedIn={user !== null}
        />
      </div>

      {exercise.image_urls.length > 0 ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {/* The source ships start and end positions, in order. */}
          {exercise.image_urls.map((url, index) => (
            <Image
              key={url}
              src={url}
              alt={`${exercise.name}, position ${index + 1} of ${exercise.image_urls.length}`}
              width={640}
              height={480}
              priority={index === 0}
              className="w-full rounded-xl border border-border object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Tags title="Primary muscles" values={exercise.primary_muscles} />
        <Tags title="Secondary muscles" values={exercise.secondary_muscles} />
        <Tags title="Equipment" values={exercise.equipment} />
        <Tags title="Type" values={exercise.exercise_types} />
        {exercise.force ? <Tags title="Force" values={[exercise.force]} /> : null}
        {exercise.level ? <Tags title="Level" values={[exercise.level]} /> : null}
      </div>

      {history ? <ExerciseHistoryPanel history={history} /> : null}

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
  );
}
