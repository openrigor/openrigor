import { vi } from "vitest";
import messages from "./messages/en.json";

function translate(namespace: string, key: string, values?: unknown) {
  let message: unknown = messages[namespace as keyof typeof messages];
  for (const part of key.split(".")) {
    if (!message || typeof message !== "object") {
      break;
    }
    message = (message as Record<string, unknown>)[part];
  }

  let result = typeof message === "string" ? message : key;
  if (values && typeof values === "object") {
    result = result.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = (values as Record<string, unknown>)[name];
      return value === undefined ? `{${name}}` : String(value);
    });
  }
  return result;
}

function translator(namespace = "common") {
  return (key: string, values?: unknown) => translate(namespace, key, values);
}

vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    ...actual,
    useTranslations: (namespace?: string) => translator(namespace),
  };
});

vi.mock("next-intl/server", async () => {
  const actual =
    await vi.importActual<typeof import("next-intl/server")>(
      "next-intl/server"
    );
  return {
    ...actual,
    getTranslations: async (namespace?: string) => translator(namespace),
  };
});
