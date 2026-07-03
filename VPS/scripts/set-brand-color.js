const fs = require('fs');
const p = '/root/projects/jenixindia/VPS/backend/src/database/json/settings.json';
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
s.branding.themeColor = '#e8231a';
s.branding.buttonColor = '#e8231a';
fs.writeFileSync(p, JSON.stringify(s, null, 2));
console.log('done:', s.branding.themeColor, s.branding.buttonColor);
