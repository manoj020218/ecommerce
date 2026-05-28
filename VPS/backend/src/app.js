const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
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

  app.use(helmet());
  app.use(cors());
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(attachRequestContext);

  app.use(
    "/static/uploads",
    express.static(path.resolve(process.cwd(), env.uploadDir), {
      etag: true,
      maxAge: "7d"
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

  app.use(createPublicSeoRouter());
  app.use(createPublicGoogleMerchantRouter());
  app.use(createPublicFacebookFeedRouter());
  app.use("/api", apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
