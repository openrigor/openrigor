import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_HEX_LENGTH = 64;

function parseEncryptionKey(keyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex) || keyHex.length !== KEY_HEX_LENGTH) {
    throw new Error("BYOK_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt an API key with AES-256-GCM.
 * Output is a single base64 string: iv (12) || authTag (16) || ciphertext.
 */
export function encryptApiKey(plaintext: string, keyHex: string): string {
  const key = parseEncryptionKey(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Decrypt a payload produced by encryptApiKey. Throws on tamper / wrong key.
 */
export function decryptApiKey(payload: string, keyHex: string): string {
  const key = parseEncryptionKey(keyHex);
  let buf: Buffer;
  try {
    buf = Buffer.from(payload, "base64");
  } catch {
    throw new Error("Invalid encrypted API key payload");
  }
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted API key payload");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Mask for UI display — never return the full key to the browser. */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length > 8) {
    return `sk-…${apiKey.slice(-4)}`;
  }
  return "••••••••";
}
