const { env } = require("./config/env");
const { createApp } = require("./app");

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Jenix backend listening on port ${env.port}`);
});

// Without these, an unhandled rejection/exception anywhere off the Express request path
// (a timer, a stray promise in a background task, etc.) kills the whole Node process
// and drops every in-flight request. PM2 restarts it, but the app flaps under load.
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  // eslint-disable-next-line no-console
  console.error("Uncaught exception:", error);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
