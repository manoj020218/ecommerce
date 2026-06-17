#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE_DOMAIN="${STORE_DOMAIN:-businessdomain.com}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.businessdomain.com}"
API_DOMAIN="${API_DOMAIN:-api.businessdomain.com}"
BACKEND_PORT="${BACKEND_PORT:-4100}"
OUTPUT_PATH="${OUTPUT_PATH:-/etc/nginx/sites-available/jenix-commerce.conf}"
ENABLE_SSL="false"
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --store-domain) STORE_DOMAIN="$2"; shift ;;
    --admin-domain) ADMIN_DOMAIN="$2"; shift ;;
    --api-domain) API_DOMAIN="$2"; shift ;;
    --backend-port) BACKEND_PORT="$2"; shift ;;
    --output) OUTPUT_PATH="$2"; shift ;;
    --ssl) ENABLE_SSL="true" ;;
    --dry-run) DRY_RUN="true" ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

TMP_FILE="$(mktemp)"

node "$ROOT_DIR/scripts/render-nginx-config.js" \
  --storefront-domain "$STORE_DOMAIN" \
  --admin-domain "$ADMIN_DOMAIN" \
  --api-domain "$API_DOMAIN" \
  --deploy-root "$ROOT_DIR" \
  --backend-port "$BACKEND_PORT" \
  --ssl "$ENABLE_SSL" \
  --output "$TMP_FILE" >/dev/null

if [[ "$DRY_RUN" == "true" ]]; then
  cat "$TMP_FILE"
  rm -f "$TMP_FILE"
  exit 0
fi

sudo install -m 644 "$TMP_FILE" "$OUTPUT_PATH"
sudo ln -sf "$OUTPUT_PATH" /etc/nginx/sites-enabled/jenix-commerce.conf
sudo nginx -t
sudo systemctl reload nginx
rm -f "$TMP_FILE"

echo "Nginx configuration applied to $OUTPUT_PATH."
