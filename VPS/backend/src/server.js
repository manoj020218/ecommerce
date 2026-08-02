const { env } = require("./config/env");
const { createApp } = require("./app");
const { runReminderDispatch } = require("./modules/abandoned-cart/abandoned-cart.service");

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Jenix backend listening on port ${env.port}`);
});

// Abandoned-cart reminders previously only ever went out when an admin
// clicked "Run Due Reminders" in the admin panel — the 30 min / 6 hr / 24 hr
// schedule was real, nothing ever triggered it on its own. This is the only
// piece of the recovery pipeline that's genuinely new infrastructure; the
// dispatch logic, templates, and recovery link were already built. Runs
// here (not in app.js) so the regression suite — which builds the app via
// createApp() directly, never through server.js — never has this firing in
// the background during a test run.
const ABANDONED_CART_REMINDER_INTERVAL_MS = 5 * 60 * 1000;

function dispatchAbandonedCartReminders() {
  runReminderDispatch({ limit: 50 }, { id: "system", role: "system" }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Abandoned cart reminder dispatch failed:", error);
  });
}

dispatchAbandonedCartReminders();
const abandonedCartReminderTimer = setInterval(
  dispatchAbandonedCartReminders,
  ABANDONED_CART_REMINDER_INTERVAL_MS
);

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
  clearInterval(abandonedCartReminderTimer);
  server.close(() => process.exit(0));
});
