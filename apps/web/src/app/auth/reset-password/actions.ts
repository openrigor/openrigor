"use server";

import { validatePasswords } from "@/lib/auth/password-validation";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * PKCE recovery: exchange ?code= for a session, then set the new password.
 */
export async function resetPasswordWithCode(
  code: string,
  password: string,
  confirmPassword: string
): Promise<ResetPasswordResult> {
  const validationError = validatePasswords(password, confirmPassword);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const trimmed = code.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "This reset link is invalid or has expired.",
    };
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(trimmed);

  if (exchangeError) {
    const friendly = /verifier|both auth code|expired|invalid/i.test(
      exchangeError.message
    )
      ? "This reset link is invalid or has expired."
      : exchangeError.message;
    return { ok: false, error: friendly };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return {
      ok: false,
      error: updateError.message || "Could not update password.",
    };
  }

  await supabase.auth.signOut({ scope: "others" });

  return { ok: true };
}
