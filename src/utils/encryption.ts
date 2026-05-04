import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../config/env";

const DEFAULT_KEY = env.INTEGRATION_CREDENTIALS_KEY;

function getKey() {
  if (!DEFAULT_KEY) {
    throw new Error("INTEGRATION_CREDENTIALS_KEY is not configured");
  }
  const key = Buffer.from(DEFAULT_KEY, "utf-8");
  if (key.length < 32) {
    throw new Error("INTEGRATION_CREDENTIALS_KEY must be at least 32 characters");
  }
  return key.subarray(0, 32);
}

export function encryptJson(payload: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const key = getKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptJson<T = Record<string, unknown>>(payload: string): T {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf-8")) as T;
}
