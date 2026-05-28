import { createHmac } from 'crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

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

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const checkHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (checkHash !== hash) return null;

  const userRaw = urlParams.get('user');
  if (!userRaw) return null;

  try {
    return JSON.parse(decodeURIComponent(userRaw)) as TelegramUser;
  } catch {
    return null;
  }
}
