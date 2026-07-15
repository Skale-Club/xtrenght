import { ButtonLink } from "@/shared/ui/button";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-24">
        <p className="mb-4 text-sm font-semibold tracking-widest text-accent uppercase">Xtrenght</p>

        <h1 className="max-w-2xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">
          Track your training.
          <br />
          Build real strength.
        </h1>

        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
          Log every set, follow your progress, and browse a full exercise catalogue — built on an
          open, self-hostable stack.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href="/login">Get started</ButtonLink>
          <ButtonLink href="/exercises" variant="secondary">
            Browse exercises
          </ButtonLink>
        </div>
      </main>
    </>
  );
}
