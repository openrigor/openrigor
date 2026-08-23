import { describe, expect, it } from "vitest";
import { maskEmail } from "./obfuscate";

describe("maskEmail", () => {
  it("masks a normal email after the first local-part character", () => {
    expect(maskEmail("jane@example.com")).toBe("j***@example.com");
  });

  it("does not expose malformed or empty values", () => {
    expect(maskEmail("plainaddress")).toBe("p***");
    expect(maskEmail("李雷")).toBe("李***");
    expect(maskEmail("")).toBe("***");
    expect(maskEmail("   ")).toBe("***");
    expect(maskEmail(null)).toBe("***");
    expect(maskEmail(undefined)).toBe("***");
    expect(maskEmail("@example.com")).toBe("***@example.com");
  });

  it("masks plus-addressing and preserves the domain", () => {
    expect(maskEmail("jane+research@example.com")).toBe("j***@example.com");
  });

  it("keeps the first Unicode code point without leaking the local part", () => {
    expect(maskEmail("李雷@例子.公司")).toBe("李***@例子.公司");
  });
});
