import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuthenticated } from "@/lib/supabase/verify_user_server";
import { createClient } from "@/lib/supabase/server";
import {
  submitWorkspaceForm,
  WorkspaceFormAlreadySubmittedError,
  WorkspaceItemNotFoundError,
} from "@/lib/workspace/store";
import { FormValidationError } from "@/lib/workspace/form-validation";

type RouteContext = { params: Promise<{ id: string }> };

async function recordByokShare(userId: string, itemId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("byok_append_share", {
      p_user_id: userId,
      p_item_id: itemId,
    });

    if (error) {
      console.error(
        "[workspace] failed to record BYOK assignment share",
        error
      );
    }
  } catch (error) {
    // The assignment has already been submitted; sharing should not turn that
    // into a failed request when BYOK settings are unavailable.
    console.error("[workspace] failed to record BYOK assignment share", error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await verifyUserAuthenticated();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsedBody =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  try {
    const result = await submitWorkspaceForm(
      auth.user.id,
      id,
      parsedBody.values,
      {
        profileId:
          typeof parsedBody.profileId === "string"
            ? parsedBody.profileId
            : undefined,
        threadId:
          typeof parsedBody.threadId === "string"
            ? parsedBody.threadId
            : undefined,
      }
    );
    if (parsedBody.shareByok === true) {
      await recordByokShare(auth.user.id, id);
    }
    return NextResponse.json(
      { item: result.item, idempotent: result.idempotent },
      { status: result.idempotent ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof WorkspaceItemNotFoundError) {
      return NextResponse.json(
        { error: "Workspace form not found" },
        { status: 404 }
      );
    }
    if (error instanceof FormValidationError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof WorkspaceFormAlreadySubmittedError) {
      return NextResponse.json(
        { error: "Form has already been submitted" },
        { status: 409 }
      );
    }
    console.error("[workspace] failed to submit form", error);
    return NextResponse.json(
      { error: "Could not submit workspace form" },
      { status: 500 }
    );
  }
}
