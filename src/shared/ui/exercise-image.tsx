import Image from "next/image";
import type { ComponentProps } from "react";

/**
 * An exercise photo, served straight from Storage instead of through
 * /_next/image.
 *
 * Vercel bills image optimisation per unique (url, width, quality) pair, and
 * Hobby includes 5,000 a month. The catalogue is ~876 exercises with ~2 photos
 * each, rendered at four different widths across the app -- so a single visitor
 * paging through it can mint a couple of thousand transformations on their own.
 * We burned 3,690 in one day that way.
 *
 * The optimiser was buying us little regardless: the source JPGs are already
 * 30-60 KB, and Supabase Storage fronts them with its own CDN. Trading ~30 KB a
 * photo for a quota that a handful of curious visitors can exhaust is a bad
 * deal, so the catalogue opts out wholesale.
 *
 * Programme cover art still goes through next/image -- there are only a few
 * dozen of those URLs, and they render large enough for the WebP conversion to
 * actually pay for itself.
 */
export function ExerciseImage(props: ComponentProps<typeof Image>) {
  // jsx-a11y cannot see through the spread. `alt` is required by the prop type,
  // so every call site is still forced to pass one.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} unoptimized />;
}
