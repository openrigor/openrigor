import { Client } from "@langchain/langgraph-sdk";

/**
 * Resolve the LangGraph SDK base URL.
 * Must be same-origin `/api` (proxied by Next) — a cross-origin absolute URL
 * (e.g. Tailscale Mission Control) causes CORS failures in the browser.
 */
export const resolveApiUrl = (
  configured: string | undefined,
  origin: string | undefined
): string => {
  const fallback = "http://localhost:3000/api";
  const apiUrl = configured?.trim() || fallback;

  if (!origin) {
    return apiUrl.startsWith("/") ? fallback : apiUrl;
  }

  if (apiUrl.startsWith("/")) {
    return origin + apiUrl;
  }

  try {
    const parsed = new URL(apiUrl);
    if (parsed.origin !== origin) {
      // Bad build-time env (Hermes/MC often exports NEXT_PUBLIC_API_URL).
      return origin + "/api";
    }
    return apiUrl;
  } catch {
    return origin + "/api";
  }
};

export const createClient = () => {
  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL, origin);
  return new Client({
    apiUrl,
    callerOptions: {
      fetch: (url: RequestInfo | URL, init?: RequestInit) =>
        fetch(url, {
          ...init,
          credentials: "include",
        }),
    },
  });
};
