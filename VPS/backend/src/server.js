const { env } = require("./config/env");
const { createApp } = require("./app");

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Jenix backend listening on port ${env.port}`);
});
