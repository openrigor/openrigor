import { NextResponse } from "next/server";
import { decryptApiKey } from "@opencanvas/shared/byok/crypto";
import {
  assertPublicHost,
  assertPublicHttpsUrl,
  createSafeFetch,
} from "@opencanvas/shared/byok/url";
import type { UserByokSettingsRow } from "@opencanvas/shared/byok/types";
import { createClient } from "@/lib/supabase/server";

function sanitizeMessage(message: string, max = 300): string {
  return message.replace(/\s+/g, " ").trim().slice(0, max);
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encryptionKey = process.env.BYOK_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "BYOK_ENCRYPTION_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("user_byok_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load BYOK settings" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Save your provider settings first" },
      { status: 400 }
    );
  }

  const row = data as UserByokSettingsRow;
  let apiKey: string;
  try {
    apiKey = decryptApiKey(row.api_key_enc, encryptionKey);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt saved API key" },
      { status: 500 }
    );
  }

  let baseUrl: string;
  try {
    baseUrl = assertPublicHttpsUrl(row.base_url);
    await assertPublicHost(new URL(baseUrl).hostname);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Saved base_url is not a valid public HTTPS URL",
      },
      { status: 400 }
    );
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const safeFetch = createSafeFetch();

  try {
    const response = await safeFetch(`${normalizedBase}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: row.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = sanitizeMessage(await response.text().catch(() => ""));
      const message = sanitizeMessage(
        `HTTP ${response.status} ${response.statusText}${
          bodyText ? `: ${bodyText}` : ""
        }`
      );
      return NextResponse.json({ ok: false, message });
    }

    return NextResponse.json({
      ok: true,
      message: `Connected — ${row.model} responded`,
    });
  } catch (err) {
    const raw =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Connection timed out"
          : err.message
        : "Connection failed";
    return NextResponse.json({
      ok: false,
      message: sanitizeMessage(raw),
    });
  } finally {
    clearTimeout(timeout);
  }
}
