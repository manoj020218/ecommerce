#!/bin/bash
# Requires JENIX_ADMIN_PASSWORD in the environment, e.g.:
#   JENIX_ADMIN_PASSWORD='...' bash scripts/wizard-status.sh
if [ -z "$JENIX_ADMIN_PASSWORD" ]; then
  echo "JENIX_ADMIN_PASSWORD is not set." >&2
  exit 1
fi
TOKEN=$(curl -s -X POST http://127.0.0.1:4100/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@jenixindia.com\",\"password\":\"$JENIX_ADMIN_PASSWORD\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['accessToken'])")

curl -s http://127.0.0.1:4100/api/admin/setup-wizard/ \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
ov = d.get('data',{}).get('overview',{})
print('Completed: %d/%d (%.0f%%)' % (ov.get('completedCount',0), ov.get('totalCount',0), ov.get('completionPercent',0)))
for s in ov.get('steps',[]):
    status = 'DONE' if s['complete'] else ('skip' if s.get('optional') else 'PEND')
    missing = ', '.join(s.get('missingFields',[]))
    print('  [%s] %s%s' % (status, s['key'], (': ' + missing) if missing else ''))
"
