/**
 * AES-256-GCM encryption utility for at-rest credential protection.
 *
 * Encrypted format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 * - iv:       12 bytes random per encryption (GCM recommended)
 * - authTag:  16 bytes (GCM integrity check)
 * - ciphertext: variable length
 *
 * The ENCRYPTION_KEY env var must be a 32-byte (64 hex-char) secret.
 * Never rotate this key without first re-encrypting all stored values.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DELIMITER = ':';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      '[encryption] ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"'
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns null if plaintext is null/undefined/empty.
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;

  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(DELIMITER);
}

/**
 * Decrypts a value previously encrypted with encrypt().
 * Returns null if input is null/undefined/empty.
 * Throws on tampered or corrupt ciphertext (GCM auth tag mismatch).
 */
export function decrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;

  // Detect legacy plaintext (not our <iv>:<tag>:<ct> format) — return as-is
  // This handles existing plaintext DB values during the migration window.
  const parts = ciphertext.split(DELIMITER);
  if (parts.length !== 3) {
    // Treat as unencrypted legacy value
    return ciphertext;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedData = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/** Returns true if the value appears to be in our encrypted format. */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(DELIMITER);
  return parts.length === 3 && parts[0].length === 24 && parts[1].length === 32;
}
