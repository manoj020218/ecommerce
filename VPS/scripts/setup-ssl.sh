#!/usr/bin/env bash
set -euo pipefail

LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@businessdomain.com}"
STORE_DOMAIN="${STORE_DOMAIN:-businessdomain.com}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.businessdomain.com}"
API_DOMAIN="${API_DOMAIN:-api.businessdomain.com}"
DRY_RUN="false"
STAGING_FLAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) LETSENCRYPT_EMAIL="$2"; shift ;;
    --store-domain) STORE_DOMAIN="$2"; shift ;;
    --admin-domain) ADMIN_DOMAIN="$2"; shift ;;
    --api-domain) API_DOMAIN="$2"; shift ;;
    --dry-run) DRY_RUN="true" ;;
    --staging) STAGING_FLAG="--staging" ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

CERTBOT_CMD=(
  certbot
  --nginx
  --non-interactive
  --agree-tos
  --redirect
  --email "$LETSENCRYPT_EMAIL"
  -d "$STORE_DOMAIN"
  -d "$ADMIN_DOMAIN"
  -d "$API_DOMAIN"
)

if [[ -n "$STAGING_FLAG" ]]; then
  CERTBOT_CMD+=("$STAGING_FLAG")
fi

if [[ "$DRY_RUN" == "true" ]]; then
  printf '%q ' "${CERTBOT_CMD[@]}"
  printf '\n'
  exit 0
fi

"${CERTBOT_CMD[@]}"
echo "SSL provisioning completed."
