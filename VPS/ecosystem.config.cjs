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
      // 2026-10-04: Node's default heap limit on this VPS is ~2 GB, so V8
      // never had a reason to collect garbage before pm2 killed it at 600M.
      // Most of that memory was garbage, not a leak: every request re-parses
      // the JSON stores (catalog ≈ 8 MB heap, marketing ≈ 14 MB per parse),
      // so busy hours (crawlers) reached 650-800 MB and pm2 restarted it
      // (5 times Sep 28-Oct 3). Capping old-space below the pm2 ceiling
      // makes V8 run a full GC well before 600M.
      node_args: "--max-old-space-size=448",
      env: {
        NODE_ENV: "production",
        PORT: 4100
      }
    }
  ]
};
