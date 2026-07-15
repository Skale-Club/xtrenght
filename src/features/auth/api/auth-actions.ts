"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/shared/lib/supabase/server";

export type AuthFormState = { error: string | null; message?: string };

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

/** Rejects absolute URLs so ?redirectTo= cannot bounce a signed-in user off-site. */
function safeRedirectTo(value: FormDataEntryValue | null) {
  const path = String(value ?? "");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
}

export async function signIn(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase deliberately returns one message for unknown-email and
    // wrong-password. Passing it through avoids leaking who has an account.
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectTo(formData.get("redirectTo")));
}

export async function signUp(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user trigger to seed profiles.display_name.
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // With email confirmation on, Supabase returns a user but no session.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  return { error: null, message: "Check your inbox to confirm your address." };
}

export async function requestPasswordReset(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Enter your email address." };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  // Deliberately the same message whether or not the address has an account.
  // Saying "no such user" would turn this form into an account oracle.
  return { error: null, message: "If that address has an account, a reset link is on its way." };
}

export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmation) {
    return { error: "The passwords do not match." };
  }

  const supabase = await createClient();

  // Reaching this page means the recovery link was exchanged for a session by
  // /auth/confirm, so updateUser acts on the right account. Without that
  // session Supabase rejects the call rather than changing a stranger's
  // password.
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
