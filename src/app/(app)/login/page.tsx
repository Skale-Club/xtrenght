import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/features/auth/ui/auth-form";
import { createClient } from "@/shared/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That link is not valid. Request a new one.",
  expired_link: "That link has expired. Request a new one.",
  missing_code: "Sign-in could not be completed. Try again.",
  auth_failed: "Sign-in could not be completed. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const { redirectTo, error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="mb-8 text-sm text-muted">Sign in to log your next session.</p>

      {error ? (
        <p role="alert" className="mb-6 w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-danger">
          {ERROR_MESSAGES[error] ?? "Something went wrong. Try again."}
        </p>
      ) : null}

      <AuthForm redirectTo={redirectTo} />
    </main>
  );
}
