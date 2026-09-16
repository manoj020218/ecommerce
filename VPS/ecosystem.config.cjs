module.exports = {
  apps: [
    {
      name: "jenix-backend",
      script: "backend/src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      // Crash-loop guard: if it fails to stay up min_uptime ms, that counts
      // toward max_restarts: once exceeded PM2 stops retrying (goes to
      // "errored") instead of restarting forever — that's what let
      // edge-gym-worker crash-loop unnoticed for 2 months on the old VPS.
      min_uptime: "30s",
      max_restarts: 10,
      // Auto-restart if a leak pushes it past a sane ceiling, rather than
      // slowly starving the rest of the box. Raised from 350M on 2026-09-16
      // — that ceiling was too tight for this app's own baseline+traffic
      // peaks (confirmed a legit crawler burst hit 446M with WhatsApp fully
      // disconnected, so it wasn't a WhatsApp-only problem) and was causing
      // needless restarts of the whole backend under normal load.
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 4100
      }
    }
  ]
};
