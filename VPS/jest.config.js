/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/backend/src/**/*.test.js"],
  collectCoverageFrom: [
    "backend/src/**/*.js",
    "!backend/src/server.js",
    "!backend/src/checks/**"
  ],
  coverageReporters: ["text", "lcov"]
};
