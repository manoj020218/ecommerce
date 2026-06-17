#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="false"
INSTALL_NODE="true"
INSTALL_PM2="true"
INSTALL_NGINX="true"
INSTALL_CERTBOT="true"
INSTALL_MONGODB="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN="true" ;;
    --skip-node) INSTALL_NODE="false" ;;
    --skip-pm2) INSTALL_PM2="false" ;;
    --skip-nginx) INSTALL_NGINX="false" ;;
    --skip-certbot) INSTALL_CERTBOT="false" ;;
    --install-mongodb) INSTALL_MONGODB="true" ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

run_cmd() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "$*"
    return 0
  fi

  eval "$@"
}

run_cmd "sudo apt-get update"
run_cmd "sudo apt-get install -y curl git ca-certificates gnupg"

if [[ "$INSTALL_NODE" == "true" ]]; then
  run_cmd "sudo apt-get install -y nodejs npm"
  run_cmd "sudo corepack enable || true"
fi

if [[ "$INSTALL_NGINX" == "true" ]]; then
  run_cmd "sudo apt-get install -y nginx"
fi

if [[ "$INSTALL_CERTBOT" == "true" ]]; then
  run_cmd "sudo apt-get install -y certbot python3-certbot-nginx"
fi

if [[ "$INSTALL_PM2" == "true" ]]; then
  run_cmd "sudo npm install -g pm2"
fi

if [[ "$INSTALL_MONGODB" == "true" ]]; then
  echo "MongoDB install is intentionally not automated in this script because the current runtime ships with JSON-file stores. Add a MongoDB adapter before enabling automated database provisioning." >&2
fi

echo "VPS bootstrap plan completed."
