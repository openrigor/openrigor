"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/teaching/admin-client";

export type ForgotPasswordResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordReset(
  formData: FormData
): Promise<ForgotPasswordResult> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { ok: false, error: "Enter your email address." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const redirectTo = `${getSiteUrl().replace(/\/$/, "")}/auth/reset-password`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  // Always show success for a well-formed email so we do not leak which
  // addresses are registered. Log failures without the email address.
  if (error) {
    console.error("Password reset email failed", {
      status: error.status,
      message: error.message,
    });
  }

  return { ok: true };
}
