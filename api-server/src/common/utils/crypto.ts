import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Async key derivation using scrypt (C-6 fix).
 *
 * Node.js is single-threaded.  `scryptSync` blocks the entire event loop for
 * the duration of the key-derivation work (typically 10–100 ms depending on
 * cost parameters).  Under concurrent requests this serialises every encrypt/
 * decrypt operation and can be abused to freeze the server.
 *
 * `crypto.scrypt` is the async counterpart: it delegates the CPU-bound work
 * to libuv's thread pool, returning control to the event loop immediately and
 * resolving the promise when the derivation is complete.
 */
const scryptAsync = promisify(scrypt);

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH) as Promise<Buffer>;
}

/**
 * Encrypts `text` with AES-256-GCM, deriving the key from `password` via
 * scrypt.  Returns a base64 string containing: salt | iv | auth-tag | ciphertext.
 *
 * Now async — callers must `await` this function.
 */
export async function encrypt(text: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const iv   = randomBytes(IV_LENGTH);
  const key  = await deriveKey(password, salt);

  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();

  // Layout: salt (16) | iv (16) | auth-tag (16) | ciphertext
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64 blob produced by `encrypt`.
 *
 * Now async — callers must `await` this function.
 */
export async function decrypt(encryptedBase64: string, password: string): Promise<string> {
  const data = Buffer.from(encryptedBase64, 'base64');

  const salt      = data.subarray(0, SALT_LENGTH);
  const iv        = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag       = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = await deriveKey(password, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
