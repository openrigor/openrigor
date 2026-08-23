export const RESEARCH_SITE_ORIGIN = "https://research.evaluchat.org";
export const RESEARCH_METHOD_COLLECTION = "methods";

export function publicMethodPageUrl(methodId: string): string {
  return `${RESEARCH_SITE_ORIGIN}/${RESEARCH_METHOD_COLLECTION}/${encodeURIComponent(methodId)}.html`;
}
