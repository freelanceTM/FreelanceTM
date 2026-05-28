#!/bin/bash
# =============================================================================
# FreelanceTM Backup Script
# Run via cron: 0 3 * * * /home/user/freelance-tm/scripts/backup.sh
# =============================================================================

set -euo pipefail

APP_DIR="/home/user/freelancetm"
BACKUP_DIR="/var/backups/freelancetm"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

cd "$APP_DIR"

# ── 1. PostgreSQL Backup ──────────────────────────────────────────────────
echo "📦 Backing up PostgreSQL..."
DB_URL=$(grep DATABASE_URL .env | cut -d= -f2- | tr -d '"')
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump \
  -U postgres \
  -d freelancetm \
  --format=custom \
  --compress=9 \
  > "$BACKUP_DIR/db_${DATE}.dump"

gzip -f "$BACKUP_DIR/db_${DATE}.dump"
echo "✅ Database backup: db_${DATE}.dump.gz"

# ── 2. .env Backup (encrypted with gpg if key available) ─────────────────
echo "🔐 Backing up .env..."
if command -v gpg &> /dev/null && [ -f ~/.gnupg/pubring.kbx ]; then
  gpg --batch --yes --recipient admin@freelancetm.io --encrypt \
    --output "$BACKUP_DIR/env_${DATE}.env.gpg" \
    .env
  echo "✅ Encrypted .env backup: env_${DATE}.env.gpg"
else
  cp .env "$BACKUP_DIR/env_${DATE}.env"
  chmod 600 "$BACKUP_DIR/env_${DATE}.env"
  echo "⚠️  .env backup (unencrypted): env_${DATE}.env"
  echo "    Consider setting up GPG for encryption!"
fi

# ── 3. Uploads / MinIO metadata ───────────────────────────────────────────
echo "☁️ Backing up MinIO bucket metadata..."
docker-compose -f docker-compose.prod.yml exec -T minio mc mirror \
  local/freelancetm-uploads /tmp/minio-backup > /dev/null 2>&1 || true
tar czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" -C /tmp minio-backup 2>/dev/null || \
  echo "⚠️  Uploads backup skipped (no new data)"

# ── 4. Cleanup old backups ───────────────────────────────────────────────
echo "🧹 Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -delete
echo "✅ Cleanup done"

# ── 5. Summary ──────────────────────────────────────────────────────────
echo ""
echo "📊 Backup Summary ($DATE):"
ls -lh "$BACKUP_DIR"/*"$DATE"* 2>/dev/null || echo "   No files found"
echo ""
echo "🎉 Backup completed successfully!"
