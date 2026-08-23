import { useEffect, useState } from "react";

export type SharedProviderEntry = {
  itemId?: string;
  providerLabel?: string;
};

export function useSharedProviderLabel(itemId?: string): string | undefined {
  const [providerLabel, setProviderLabel] = useState<string>();

  useEffect(() => {
    if (!itemId) {
      setProviderLabel(undefined);
      return;
    }

    setProviderLabel(undefined);
    let cancelled = false;
    void fetch("/api/byok/shared", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setProviderLabel(undefined);
          return;
        }
        const entries = (await response.json()) as SharedProviderEntry[];
        const entry = entries.find((candidate) => candidate.itemId === itemId);
        if (!cancelled) setProviderLabel(entry?.providerLabel);
      })
      .catch(() => {
        if (!cancelled) setProviderLabel(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return providerLabel;
}
