import { describe, expect, it } from "vitest";
import {
  classifyInviteEmailFailure,
  describeInviteEmailFailure,
} from "./invite-email-failure";

describe("classifyInviteEmailFailure", () => {
  it("classifies GoTrue rate limiting", () => {
    expect(classifyInviteEmailFailure("email rate limit exceeded")).toBe(
      "rate_limited"
    );
  });

  it("classifies SMTP credential rejection", () => {
    expect(
      classifyInviteEmailFailure("535 5.7.8 Error: authentication failed")
    ).toBe("smtp_auth_failed");
  });

  it("classifies anything else as a generic send failure", () => {
    expect(classifyInviteEmailFailure("dial tcp: i/o timeout")).toBe(
      "send_failed"
    );
  });
});

describe("describeInviteEmailFailure", () => {
  it("does not blame rate limiting for an SMTP credential failure", () => {
    expect(describeInviteEmailFailure("smtp_auth_failed")).toBe(
      "Email server rejected our credentials"
    );
  });

  it("names rate limiting when that is the real cause", () => {
    expect(describeInviteEmailFailure("rate_limited")).toBe(
      "Email provider rate limit"
    );
  });
});
