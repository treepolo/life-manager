import { ApiError } from "@/core/errors/api-error";

interface EncryptedValue {
  algorithm: "AES-GCM-256";
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importEncryptionKey(base64Key: string | undefined): Promise<CryptoKey> {
  if (!base64Key) {
    throw new ApiError(503, "OAUTH_CONFIGURATION_MISSING", "伺服器尚未設定token加密金鑰。");
  }
  const raw = base64ToBytes(base64Key);
  if (raw.byteLength !== 32) {
    throw new ApiError(503, "OAUTH_CONFIGURATION_MISSING", "token加密金鑰必須是32位元組的Base64值。");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string, base64Key: string | undefined): Promise<string> {
  const key = await importEncryptionKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  const payload: EncryptedValue = {
    algorithm: "AES-GCM-256",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(payload);
}

export async function decryptSecret(serialized: string, base64Key: string | undefined): Promise<string> {
  const key = await importEncryptionKey(base64Key);
  const payload = JSON.parse(serialized) as EncryptedValue;
  if (payload.algorithm !== "AES-GCM-256") {
    throw new ApiError(500, "INTERNAL_ERROR", "不支援的秘密加密格式。");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomUrlSafe(bytes = 32): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
