module.exports = {
  apps: [
    {
      name: "jenix-backend",
      script: "backend/src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 4100
      }
    }
  ]
};
