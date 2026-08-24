export const RESEARCH_SITE_ORIGIN = "https://research.openrigor.org";
export const RESEARCH_METHOD_COLLECTION = "methods";

export function publicMethodPageUrl(methodId: string): string {
  return `${RESEARCH_SITE_ORIGIN}/${RESEARCH_METHOD_COLLECTION}/${encodeURIComponent(methodId)}.html`;
}

export function methodSourcePageUrl(source: MethodSource): string | undefined {
  return source.privateRepository ? undefined : publicMethodPageUrl(source.id);
}
import type { MethodSource } from "./types";
