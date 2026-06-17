#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_OUTPUT="${ENV_OUTPUT:-$ROOT_DIR/.env}"
FRONT_ENV_OUTPUT="${FRONT_ENV_OUTPUT:-$ROOT_DIR/apps/front/.env.production}"
ADMIN_ENV_OUTPUT="${ADMIN_ENV_OUTPUT:-$ROOT_DIR/apps/admin-panel/.env.production}"

DRY_RUN="false"
SKIP_INSTALL="false"
SKIP_BUILD="false"
WRITE_ENV_ONLY="false"
FORCE="false"
STORE_DOMAIN="${STORE_DOMAIN:-https://businessdomain.com}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-https://admin.businessdomain.com}"
API_DOMAIN="${API_DOMAIN:-https://api.businessdomain.com}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-admin@businessdomain.com}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-ChangeMe@123}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN="true" ;;
    --skip-install) SKIP_INSTALL="true" ;;
    --skip-build) SKIP_BUILD="true" ;;
    --write-env-only) WRITE_ENV_ONLY="true" ;;
    --force) FORCE="true" ;;
    --store-domain) STORE_DOMAIN="$2"; shift ;;
    --admin-domain) ADMIN_DOMAIN="$2"; shift ;;
    --api-domain) API_DOMAIN="$2"; shift ;;
    --super-admin-email) SUPER_ADMIN_EMAIL="$2"; shift ;;
    --super-admin-password) SUPER_ADMIN_PASSWORD="$2"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

cd "$ROOT_DIR"

node "$ROOT_DIR/scripts/generate-env.js" \
  --output "$ENV_OUTPUT" \
  --front-output "$FRONT_ENV_OUTPUT" \
  --admin-output "$ADMIN_ENV_OUTPUT" \
  --store-domain "$STORE_DOMAIN" \
  --admin-domain "$ADMIN_DOMAIN" \
  --api-domain "$API_DOMAIN" \
  --super-admin-email "$SUPER_ADMIN_EMAIL" \
  --super-admin-password "$SUPER_ADMIN_PASSWORD" \
  --force "$FORCE" \
  --dry-run "$DRY_RUN"

if [[ "$WRITE_ENV_ONLY" == "true" ]]; then
  exit 0
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run: would execute 'pnpm install', 'pnpm build:front', 'pnpm build:admin', and 'node scripts/seed-admin.js'."
  exit 0
fi

if [[ "$SKIP_INSTALL" != "true" ]]; then
  pnpm install
fi

if [[ "$SKIP_BUILD" != "true" ]]; then
  pnpm build:front
  pnpm build:admin
fi

node "$ROOT_DIR/scripts/seed-admin.js" \
  --email "$SUPER_ADMIN_EMAIL" \
  --password "$SUPER_ADMIN_PASSWORD"

echo "Install flow completed."
