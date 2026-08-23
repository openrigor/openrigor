export const TRACKING_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidTrackingId(v: unknown): boolean {
  return typeof v === "string" && TRACKING_ID_RE.test(v);
}
