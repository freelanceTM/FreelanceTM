/**
 * Referral system constants.
 *
 * REFERRAL_BONUS_NANO — credited to the referrer's custodial TON wallet
 *   when the referred user completes their first order as a buyer.
 *   0.5 TON = 500_000_000 nanoTON.
 *
 * REFERRAL_CODE_PREFIX / REFERRAL_CODE_CHARS — format: "REF-<8 random chars>"
 *   e.g. REF-AB3XK9QZ
 *   Short, URL-safe, human-typeable, collision-resistant for millions of users.
 */
export const REFERRAL_BONUS_NANO = 500_000_000n; // 0.5 TON

export const REFERRAL_CODE_PREFIX = 'REF';
export const REFERRAL_CODE_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const REFERRAL_CODE_LENGTH = 8;
