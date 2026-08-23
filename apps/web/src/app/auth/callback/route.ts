import { NextResponse } from "next/server";
// The client you created from the Server-Side Auth instructions
import { createClient } from "@/lib/supabase/server";
import { postLoginPath } from "@/lib/teaching/config";
import { ensureDefaultWorkspaceItem } from "@/lib/workspace/store";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Optional override; otherwise land on the canvas after auth.
  const nextOverride = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        try {
          await ensureDefaultWorkspaceItem(user.id);
        } catch (workspaceError) {
          console.error("Failed to initialize workspace", workspaceError);
        }
      }
      const next =
        nextOverride &&
        nextOverride.startsWith("/") &&
        !nextOverride.startsWith("//")
          ? nextOverride
          : postLoginPath(user);
      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
