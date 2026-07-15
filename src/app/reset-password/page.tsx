"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updatePassword, type AuthFormState } from "@/features/auth/api/auth-actions";
import { Button } from "@/shared/ui/button";

const initialState: AuthFormState = { error: null };

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground " +
  "placeholder:text-muted focus:border-accent focus:outline-none";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Set new password"}
    </Button>
  );
}

/**
 * Reached only via the recovery link, which /auth/confirm exchanges for a
 * session first. proxy.ts gates this route like any other private page, so
 * arriving without that session lands on /login instead.
 */
export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(updatePassword, initialState);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Set a new password</h1>
      <p className="mb-8 text-sm text-muted">At least 8 characters.</p>

      <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <SubmitButton />
      </form>
    </main>
  );
}
