// Serializes the code paths that can turn a paid attempt into an order:
// the browser confirm (razorpay-confirm / cashfree-confirm) and the gateway
// webhook. Each one reads the JSON stores, checks attempt.status, then writes.
// Run concurrently for the same payment, both could see status "created" and
// both create an order. Once Razorpay webhooks started matching attempts (by
// order_id), the confirm call and the payment.captured webhook routinely land
// within milliseconds of each other, so they must take turns.
//
// Backend runs as a single pm2 fork process (ecosystem.config.cjs), so an
// in-process queue is sufficient. Payment volume is low; one-at-a-time is fine.

// If one run somehow never settles, stop blocking everyone else after this.
const MAX_HOLD_MS = 30000;

let queue = Promise.resolve();

function runPaymentExclusive(task) {
  const run = queue.then(() => task());
  const settled = run.catch(() => {});
  queue = Promise.race([
    settled,
    new Promise((resolve) => setTimeout(resolve, MAX_HOLD_MS).unref())
  ]);
  return run;
}

function withPaymentLock(fn) {
  return (...args) => runPaymentExclusive(() => fn(...args));
}

module.exports = { runPaymentExclusive, withPaymentLock };
