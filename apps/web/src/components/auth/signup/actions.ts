"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/teaching/admin-client";
import { ensureDefaultWorkspaceItem } from "@/lib/workspace/store";
import { SignupWithEmailInput } from "./Signup";

export async function signup(input: SignupWithEmailInput) {
  const supabase = await createClient();

  const metadata: Record<string, string> = {};

  if (input.name) {
    metadata.name = input.name;
    metadata.full_name = input.name;
    metadata.registrationComplete = "true";
  }

  const data = {
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${getSiteUrl().replace(/\/$/, "")}/auth/confirm?next=${encodeURIComponent("/workspace")}`,
      data: metadata,
    },
  };

  const { data: signUpData, error } = await supabase.auth.signUp(data);

  if (error) {
    console.error(error);
    redirect("/auth/signup?error=true");
  }

  if (signUpData.session) {
    if (signUpData.user) {
      try {
        await ensureDefaultWorkspaceItem(signUpData.user.id);
      } catch (workspaceError) {
        console.error("Failed to initialize workspace", workspaceError);
      }
    }
    redirect("/workspace");
  }

  redirect("/auth/signup/success");
}
