"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestPasswordReset, type AuthFormState } from "@/features/auth/api/auth-actions";
import { Button } from "@/shared/ui/button";

const initialState: AuthFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(requestPasswordReset, initialState);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mb-8 text-sm text-muted">We&apos;ll email you a link to set a new one.</p>

      <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        {state.message ? (
          <p role="status" className="text-sm text-accent">
            {state.message}
          </p>
        ) : null}

        <SubmitButton />
      </form>

      <Link href="/login" className="mt-6 text-sm text-muted hover:text-foreground">
        Back to sign in
      </Link>
    </main>
  );
}
