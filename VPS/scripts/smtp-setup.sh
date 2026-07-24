#!/bin/bash
# Requires JENIX_ADMIN_PASSWORD and JENIX_SMTP_PASSWORD in the environment, e.g.:
#   JENIX_ADMIN_PASSWORD='...' JENIX_SMTP_PASSWORD='...' bash scripts/smtp-setup.sh
if [ -z "$JENIX_ADMIN_PASSWORD" ] || [ -z "$JENIX_SMTP_PASSWORD" ]; then
  echo "JENIX_ADMIN_PASSWORD and/or JENIX_SMTP_PASSWORD is not set." >&2
  exit 1
fi
TOKEN=$(curl -s -X POST http://127.0.0.1:4100/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@jenixindia.com\",\"password\":\"$JENIX_ADMIN_PASSWORD\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['accessToken'])")

echo "Token length: ${#TOKEN}"

RESULT=$(curl -s -X PUT http://127.0.0.1:4100/api/admin/setup-wizard/steps/smtp_email \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"host\": \"smtp.gmail.com\",
    \"port\": 587,
    \"secure\": false,
    \"username\": \"jenixindia@gmail.com\",
    \"password\": \"$JENIX_SMTP_PASSWORD\",
    \"fromName\": \"Jenix India\",
    \"fromEmail\": \"jenixindia@gmail.com\",
    \"replyToEmail\": \"jenixindia@gmail.com\"
  }")

echo "Result: $RESULT"
