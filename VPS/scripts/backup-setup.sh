#!/bin/bash
# Requires JENIX_ADMIN_PASSWORD in the environment, e.g.:
#   JENIX_ADMIN_PASSWORD='...' bash scripts/backup-setup.sh
if [ -z "$JENIX_ADMIN_PASSWORD" ]; then
  echo "JENIX_ADMIN_PASSWORD is not set." >&2
  exit 1
fi
TOKEN=$(curl -s -X POST http://127.0.0.1:4100/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@jenixindia.com\",\"password\":\"$JENIX_ADMIN_PASSWORD\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['accessToken'])")

curl -s -X PUT http://127.0.0.1:4100/api/admin/setup-wizard/steps/backup_settings \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "backupDir": "backups",
    "retentionDays": 14,
    "cronExpression": "0 2 * * *",
    "includeUploads": true,
    "includeEnvFile": false,
    "runHealthCheckAfterBackup": true,
    "notifyEmail": "jenixindia@gmail.com"
  }' | python3 -c "import json,sys; d=json.load(sys.stdin); print('backup_settings:', d.get('success'), d.get('message',''))"
