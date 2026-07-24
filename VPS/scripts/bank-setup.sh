#!/bin/bash
# Requires JENIX_ADMIN_PASSWORD in the environment, e.g.:
#   JENIX_ADMIN_PASSWORD='...' bash scripts/bank-setup.sh
if [ -z "$JENIX_ADMIN_PASSWORD" ]; then
  echo "JENIX_ADMIN_PASSWORD is not set." >&2
  exit 1
fi
TOKEN=$(curl -s -X POST http://127.0.0.1:4100/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@jenixindia.com\",\"password\":\"$JENIX_ADMIN_PASSWORD\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['accessToken'])")

curl -s -X PUT http://127.0.0.1:4100/api/admin/setup-wizard/steps/manual_bank_upi \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "beneficiaryName": "Jain Enterprises",
    "bankName": "Union Bank of India",
    "accountHolderName": "Jain Enterprises",
    "accountNumber": "259611100000423",
    "ifsc": "UBIN0825964",
    "accountType": "current",
    "branch": "Mansarovar, Jaipur (Rajasthan)",
    "upiId": "jenixindia@okhdfc",
    "instructions": "Please transfer the order amount to the above account and share the payment screenshot via WhatsApp at 7240226566. Your order will be processed within 24 hours of payment confirmation."
  }' | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('success:', d.get('success'), '|', d.get('message',''))
"
