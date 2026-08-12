const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { rateLimit } = require("express-rate-limit");
const { env } = require("./config/env");
const { attachRequestContext } = require("./middlewares/request-context");
const { notFoundHandler, errorHandler } = require("./middlewares/error-handler");
const { apiRouter } = require("./routes");
const { createPublicSeoRouter } = require("./modules/seo/seo.routes");
const {
  createPublicGoogleMerchantRouter
} = require("./modules/google-merchant/google-merchant.routes");
const {
  createPublicFacebookFeedRouter
} = require("./modules/facebook-feed/facebook-feed.routes");
const {
  createPublicPrerenderRouter
} = require("./modules/prerender/prerender.routes");

function createApp() {
  const app = express();

  // nginx is the sole reverse-proxy hop in front of this app (no CDN in
  // between — direct Let's Encrypt certs on this VPS). Without this, Express
  // sees every request as originating from nginx's own loopback connection
  // instead of the real visitor, which breaks two things silently in
  // production only (rate limiters are dev-disabled, so this never showed up
  // in testing): (1) express-rate-limit's per-IP buckets collapse into one
  // shared bucket across ALL simultaneous visitors combined, so real
  // customers could get 429'd on ordinary browsing once concurrent traffic
  // exceeded the limit — a very plausible explanation for the intermittent
  // "product not found on a real, live product" reports (2026-08-12); (2)
  // any per-IP logging/analytics downstream would also be wrong. `1` trusts
  // exactly the nearest hop (nginx), matching `proxy_set_header
  // X-Forwarded-For $proxy_add_x_forwarded_for;` in the nginx config.
  app.set("trust proxy", 1);

  // Express auto-generates an ETag for every res.json() response by
  // default. Confirmed live: this made GET /api/admin/dashboard return 304
  // on repeat requests once the browser cached an ETag — and since
  // apiFetch's success check is `response.ok` (true only for HTTP
  // 200-299), a 304 is treated as a failed request and silently swallowed
  // by the admin panel's `.catch(() => {})` handlers, showing stale/zeroed
  // data even though the underlying (dynamic, constantly-changing) data
  // was actually fine. None of this API is cacheable content — disable
  // ETag generation entirely rather than special-case every caller.
  app.set("etag", false);

  const allowedOrigins = env.corsOrigin
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin '${origin}' not allowed`));
      },
      credentials: true
    })
  );
  app.use(morgan("dev"));
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(attachRequestContext);

  function setCorp(req, res, next) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  }

  app.use(
    "/static/uploads",
    setCorp,
    express.static(path.resolve(process.cwd(), env.uploadDir), {
      etag: true,
      maxAge: "7d"
    })
  );

  app.use(
    "/static/migration",
    setCorp,
    express.static(path.resolve(process.cwd(), env.migrationImagesDir), {
      etag: true,
      maxAge: "1d"
    })
  );

  app.get("/health", (_req, res) => {
    res.status(200).json({
      success: true,
      message: "OK",
      data: {
        service: "jenix-backend",
        status: "healthy",
        nodeEnv: env.nodeEnv
      }
    });
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
    skip: () => env.nodeEnv !== "production"
  });

  const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many OTP requests. Please try again in 15 minutes." },
    skip: () => env.nodeEnv !== "production"
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please slow down." },
    skip: () => env.nodeEnv !== "production"
  });

  app.use(createPublicSeoRouter());
  app.use(createPublicGoogleMerchantRouter());
  app.use(createPublicFacebookFeedRouter());
  app.use(createPublicPrerenderRouter());
  app.use("/api/auth/admin/login", loginLimiter);
  app.use("/api/auth/customer/login", loginLimiter);
  app.use("/api/auth/customer/register", loginLimiter);
  app.use("/api/auth/customer/password", loginLimiter);
  app.use("/api/auth/customer/otp", otpLimiter);
  app.use("/api/checkout", loginLimiter);
  app.use("/api", apiLimiter);
  // Belt-and-suspenders alongside app.set("etag", false) above: explicit
  // no-store means a browser/proxy has no basis for heuristic caching
  // either, even without an ETag or Last-Modified header to key off.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
