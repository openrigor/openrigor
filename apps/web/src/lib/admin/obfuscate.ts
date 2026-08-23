/**
 * Keep only the first Unicode code point of a local part. Invalid or empty
 * values are still rendered safely and never returned verbatim.
 */
export function maskEmail(email: string | null | undefined): string {
  const value = typeof email === "string" ? email.trim() : "";
  if (!value) return "***";

  const at = value.lastIndexOf("@");
  if (at < 0) {
    const first = Array.from(value)[0] ?? "*";
    return `${first}***`;
  }

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local) return `***@${domain}`;

  const first = Array.from(local)[0] ?? "*";
  return `${first}***@${domain}`;
}
