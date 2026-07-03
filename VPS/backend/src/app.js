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

function createApp() {
  const app = express();

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
  app.use("/api/auth/admin/login", loginLimiter);
  app.use("/api/auth/customer/login", loginLimiter);
  app.use("/api/auth/customer/register", loginLimiter);
  app.use("/api/auth/customer/password", loginLimiter);
  app.use("/api/auth/customer/otp", otpLimiter);
  app.use("/api/checkout", loginLimiter);
  app.use("/api", apiLimiter);
  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
