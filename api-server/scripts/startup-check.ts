#!/usr/bin/env ts-node
/**
 * Pre-startup configuration validation.
 * Run before `npm run start:prod` to catch missing/bad env vars early.
 */

import { config } from 'dotenv';
config({ path: ['.env', '.env.local'] });

interface Check {
  name: string;
  value?: string;
  minLength?: number;
  required?: boolean;
  validate?: (val: string) => boolean;
  hint?: string;
}

const CRITICAL_LENGTH = 32;

const checks: Check[] = [
  { name: 'NODE_ENV', required: true, validate: (v) => ['development', 'production', 'test'].includes(v) },
  { name: 'DATABASE_URL', required: true, minLength: 20 },
  { name: 'JWT_SECRET', required: true, minLength: CRITICAL_LENGTH, hint: 'Run: openssl rand -base64 48' },
  { name: 'MASTER_ENCRYPTION_KEY', required: true, minLength: CRITICAL_LENGTH, hint: 'Run: openssl rand -hex 32' },
  { name: 'TELEGRAM_BOT_TOKEN', required: true, minLength: 20, hint: 'Get from @BotFather' },
  { name: 'ADMIN_SECRET', required: true, minLength: CRITICAL_LENGTH },
  {
    name: 'PLATFORM_MNEMONIC',
    required: false,
    validate: (v) => v.split(' ').length === 24,
    hint: 'Required for TON escrow. 24 words.',
  },
  {
    name: 'SENTRY_DSN',
    required: false,
    validate: (v) => v.startsWith('https://') && v.includes('ingest.sentry.io'),
    hint: 'Optional but recommended for production',
  },
];

let exitCode = 0;

console.log('🔍 FreelanceTM Startup Check\n');

for (const check of checks) {
  const value = process.env[check.name];
  const issues: string[] = [];

  if (check.required && !value) {
    issues.push('MISSING (required)');
  }

  if (value && check.minLength && value.length < check.minLength) {
    issues.push(`TOO SHORT (min ${check.minLength} chars, got ${value.length})`);
  }

  if (value && check.validate && !check.validate(value)) {
    issues.push('INVALID FORMAT');
  }

  // Security: warn about default/weak values
  if (value && /changeme|example|password|secret123|admin/i.test(value)) {
    issues.push('WEAK/DEFAULT VALUE');
  }

  if (issues.length > 0) {
    console.log(`❌ ${check.name}: ${issues.join(', ')}`);
    if (check.hint) console.log(`   💡 Hint: ${check.hint}`);
    exitCode = 1;
  } else {
    const status = value ? '✅' : '⚪';
    const masked = value && value.length > 8
      ? `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`
      : value || '(not set)';
    console.log(`${status} ${check.name}: ${check.required ? masked : masked + ' (optional)'}`);
  }
}

console.log();

if (exitCode !== 0) {
  console.log('🚫 Startup blocked. Fix the issues above before starting the server.');
  console.log('   Copy api-server/.env.example to .env and fill all required fields.\n');
  process.exit(1);
} else {
  console.log('✅ All checks passed. Server can start safely.\n');
  process.exit(0);
}
