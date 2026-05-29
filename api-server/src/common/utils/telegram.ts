import { createHmac, timingSafeEqual } from 'crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

/**
 * Validates Telegram Mini App `initData` against the bot token and returns
 * the parsed user object, or `null` if validation fails.
 *
 * Timing-attack hardening (C-7):
 *   The previous implementation used `checkHash !== hash` — a standard JS
 *   string equality check that short-circuits on the first differing character.
 *   This leaks timing information: an attacker who can measure response latency
 *   can determine how many leading hex characters of their forged hash match the
 *   real HMAC, enabling a byte-by-byte brute-force of the 256-bit signature.
 *
 *   Fix: both values are converted to raw byte Buffers and compared using
 *   `crypto.timingSafeEqual`, which always inspects every byte in constant time
 *   regardless of where the first difference occurs.
 *
 *   Length guard:
 *   `timingSafeEqual` throws a `RangeError` if the two Buffers have different
 *   byte lengths.  An attacker can supply a `hash` of any length, so we check
 *   `Buffer.byteLength` BEFORE calling `timingSafeEqual` and return `null`
 *   immediately if they differ — no timing information is leaked because the
 *   rejection happens before the comparison loop.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
): TelegramUser | null {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return null;

  urlParams.delete('hash');

  const params: string[] = [];
  urlParams.sort();
  urlParams.forEach((value, key) => {
    params.push(`${key}=${value}`);
  });
  const dataCheckString = params.join('\n');

  const secretKey  = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const checkHash  = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // ── Constant-time HMAC comparison (C-7) ───────────────────────────────────
  //
  // Convert both hex strings to raw bytes.  `checkHash` is always 64 hex chars
  // (32 bytes — SHA-256 output).  `hash` is attacker-controlled and may be any
  // length; `Buffer.from(hex, 'hex')` silently drops invalid characters, so its
  // byte length may differ.
  //
  // We check byte lengths FIRST.  If they differ we return null immediately —
  // this path reveals only "wrong length", not any information about content.
  // Only when both Buffers are the same length do we call timingSafeEqual, which
  // inspects all bytes in constant time.
  const checkHashBuf = Buffer.from(checkHash, 'hex'); // always 32 bytes
  const hashBuf      = Buffer.from(hash, 'hex');       // attacker-supplied

  if (checkHashBuf.byteLength !== hashBuf.byteLength) return null;
  if (!timingSafeEqual(checkHashBuf, hashBuf)) return null;

  const userRaw = urlParams.get('user');
  if (!userRaw) return null;

  try {
    return JSON.parse(decodeURIComponent(userRaw)) as TelegramUser;
  } catch {
    return null;
  }
}
