const fs = require("fs");
const path = "/root/projects/jenixindia/VPS/backend/src/database/json/settings.json";
const data = JSON.parse(fs.readFileSync(path, "utf8"));
data.branding.themeColor = "#ff4d4d";
data.branding.buttonColor = "#ff4d4d";
fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("themeColor:", data.branding.themeColor, "buttonColor:", data.branding.buttonColor);
