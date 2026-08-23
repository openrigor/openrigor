export type InviteEmailFailure =
  | "rate_limited"
  | "smtp_auth_failed"
  | "send_failed";

export function classifyInviteEmailFailure(
  message: string
): InviteEmailFailure {
  if (/rate limit/i.test(message)) {
    return "rate_limited";
  }
  if (/\b535\b|authentication failed|invalid credentials/i.test(message)) {
    return "smtp_auth_failed";
  }
  return "send_failed";
}

export function describeInviteEmailFailure(
  failure: InviteEmailFailure
): string {
  switch (failure) {
    case "rate_limited":
      return "Email provider rate limit";
    case "smtp_auth_failed":
      return "Email server rejected our credentials";
    default:
      return "Email could not be sent";
  }
}
