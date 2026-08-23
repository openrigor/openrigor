"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient, createActionClient } from "@/lib/supabase/server";
import { postLoginPath } from "@/lib/teaching/config";
import { ensureDefaultWorkspaceItem } from "@/lib/workspace/store";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    console.error("Login missing email or password", {
      hasEmail: Boolean(email),
      hasPassword: Boolean(password),
    });
    redirect("/auth/login?error=missing");
  }

  // Use the lightweight client (not SSR/PKCE) for the password sign-in
  // to avoid issues with PKCE flow in server actions.
  const actionClient = createActionClient();
  const { error, data } = await actionClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Supabase login error:", error.message, error.status);
    redirect("/auth/login?error=credentials");
  }

  // Sync the session into the SSR client's cookie storage so the browser
  // gets the auth cookies via the response.
  if (data.session) {
    const ssrClient = await createClient();
    await ssrClient.auth.setSession(data.session);
  }

  try {
    await ensureDefaultWorkspaceItem(data.user.id);
  } catch (workspaceError) {
    console.error("Failed to initialize workspace", workspaceError);
  }

  revalidatePath("/", "layout");
  redirect(postLoginPath(data.user));
}
