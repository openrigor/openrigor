import { describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, maskApiKey } from "./crypto.js";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_KEY =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("byok crypto", () => {
  it("roundtrips an API key", () => {
    const plaintext = "sk-test-secret-key-value";
    const enc = encryptApiKey(plaintext, TEST_KEY);
    expect(enc).not.toContain(plaintext);
    expect(decryptApiKey(enc, TEST_KEY)).toBe(plaintext);
  });

  it("throws on wrong key", () => {
    const enc = encryptApiKey("sk-abc", TEST_KEY);
    expect(() => decryptApiKey(enc, OTHER_KEY)).toThrow();
  });

  it("throws on tampered payload", () => {
    const enc = encryptApiKey("sk-abc", TEST_KEY);
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decryptApiKey(tampered, TEST_KEY)).toThrow();
  });

  it("throws on garbage payload", () => {
    expect(() => decryptApiKey("not-valid-base64!!!", TEST_KEY)).toThrow();
    expect(() => decryptApiKey("YWJj", TEST_KEY)).toThrow();
  });

  it("throws when key hex is not 64 chars", () => {
    expect(() => encryptApiKey("sk", "short")).toThrow(/64 hex/);
    expect(() => decryptApiKey("YWJj", "short")).toThrow(/64 hex/);
  });

  it("masks long and short keys", () => {
    expect(maskApiKey("sk-abcdefghijkl")).toBe("sk-…ijkl");
    expect(maskApiKey("short")).toBe("••••••••");
    expect(maskApiKey("12345678")).toBe("••••••••");
    expect(maskApiKey("123456789")).toBe("sk-…6789");
  });
});
