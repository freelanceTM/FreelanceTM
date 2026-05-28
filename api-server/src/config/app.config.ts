import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  jwtSecret: process.env.JWT_SECRET,
  jwtAccessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  jwtRefreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',

  databaseUrl: process.env.DATABASE_URL,
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY,

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,

  tonApiKey: process.env.TON_API_KEY,
  tonEndpoint: process.env.TON_ENDPOINT,
  platformMnemonic: process.env.PLATFORM_MNEMONIC,
  platformWalletAddress: process.env.PLATFORM_WALLET_ADDRESS,

  geminiApiKey: process.env.GEMINI_API_KEY,

  adminSecret: process.env.ADMIN_SECRET,

  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
}));
