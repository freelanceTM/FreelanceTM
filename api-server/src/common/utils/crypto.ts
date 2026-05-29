import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const ALGORITHM   = 'aes-256-gcm';
const IV_LENGTH   = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH  = 16;
const KEY_LENGTH  = 32;

// ─── M-4: scrypt cost-parameter hardening with versioned ciphertext ───────────
//
//  PROBLEM:
//    The original code called scryptAsync(password, salt, KEY_LENGTH) with no
//    options, silently applying Node.js built-in defaults:
//      N = 16384 (2^14),  r = 8,  p = 1
//    N=16384 was acceptable circa 2009 but is now well below modern
//    recommendations. An attacker who obtains both the DB and the master key
//    can derive wallet keys with commodity hardware 8–16× faster than intended.
//
//  SOLUTION — versioned ciphertext:
//    The ciphertext format is prefixed with a version tag so decrypt() can
//    select the correct parameters for each blob it encounters.
//
//    V1 (legacy, no prefix):
//      raw base64 of  salt(16) | iv(16) | auth-tag(16) | ciphertext
//      scrypt params: N=16384, r=8, p=1  (Node.js built-in defaults)
//
//    V2 (hardened, prefixed with "v2:"):
//      "v2:" + base64 of  salt(16) | iv(16) | auth-tag(16) | ciphertext
//      scrypt params: N=131072 (2^17), r=8, p=1
//                     maxmem=256 MiB  (required for N=131072 × r=8)
//
//  BACKWARD COMPATIBILITY:
//    - encrypt() always writes V2 — new wallets get hardened parameters.
//    - decrypt() inspects the prefix:
//        starts with "v2:" → strip prefix, use V2 params
//        no prefix         → V1 legacy path, use original Node.js defaults
//    - Existing V1 wallets continue to decrypt without any migration step.
//    - V1→V2 re-encryption can be done lazily (on next wallet access) or via
//      a background migration job if desired; neither is required for safety.
//
//  PARAMETER RATIONALE (V2):
//    OWASP recommends N ≥ 2^17 for sensitive long-lived secrets (wallet keys).
//    N=131072 with r=8, p=1 uses ~128 MiB RAM per operation — acceptable here
//    because wallet encrypt/decrypt is infrequent and not on the hot-path.
//    maxmem is set to 256 MiB for comfortable headroom above the minimum.
//    Increasing r or p instead of N adds CPU without adding memory hardness.
// ─────────────────────────────────────────────────────────────────────────────

const VERSION_V2_PREFIX = 'v2:';

const SCRYPT_PARAMS_V1 = { N: 16384,  r: 8, p: 1 } as const;
const SCRYPT_PARAMS_V2 = {
  N: 131072,                    // 2^17 — 8× harder than the legacy default
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,   // 256 MiB — required by Node.js for N=131072 × r=8
} as const;

/**
 * Async key derivation using scrypt.
 *
 * Node.js is single-threaded. scryptSync blocks the entire event loop for the
 * duration of key-derivation work (10–100 ms). Under concurrent requests this
 * serialises every encrypt/decrypt call and can be abused to freeze the server.
 *
 * scryptAsync delegates CPU-bound work to libuv's thread pool, returning
 * control to the event loop immediately.
 */
const scryptAsync = promisify(scrypt);

async function deriveKey(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; maxmem?: number },
): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH, params) as Promise<Buffer>;
}

/**
 * Encrypts `text` with AES-256-GCM, deriving the key from `password` via
 * scrypt V2 (N=131072). Returns a versioned string:
 *   "v2:" + base64(salt(16) | iv(16) | auth-tag(16) | ciphertext)
 */
export async function encrypt(text: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const iv   = randomBytes(IV_LENGTH);
  const key  = await deriveKey(password, salt, SCRYPT_PARAMS_V2);

  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();

  // Layout: salt(16) | iv(16) | auth-tag(16) | ciphertext
  const blob = Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
  return `${VERSION_V2_PREFIX}${blob}`;
}

/**
 * Decrypts a blob produced by `encrypt`.
 *
 * Handles both versioned V2 blobs (prefix "v2:") and legacy V1 blobs (no
 * prefix) so that wallets encrypted before this upgrade continue to work
 * without any migration step.
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  let blob: string;
  let params: { N: number; r: number; p: number; maxmem?: number };

  if (encryptedData.startsWith(VERSION_V2_PREFIX)) {
    blob   = encryptedData.slice(VERSION_V2_PREFIX.length);
    params = SCRYPT_PARAMS_V2;
  } else {
    // V1 legacy path — original bare-base64 format, original Node.js defaults
    blob   = encryptedData;
    params = SCRYPT_PARAMS_V1;
  }

  const data = Buffer.from(blob, 'base64');

  const salt      = data.subarray(0, SALT_LENGTH);
  const iv        = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag       = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = await deriveKey(password, salt, params);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
