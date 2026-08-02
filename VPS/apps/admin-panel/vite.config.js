import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.svg", "icon-512.svg"],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Default generateSW behavior binds ALL navigations to the
        // precached index.html (cache-first), which means an admin who's
        // visited before keeps getting served the shell from BEFORE the
        // latest deploy, even though the server has the new build — no
        // amount of redeploying fixes it without this. Same bug, same fix
        // as the storefront's vite.config.js (see git history there for
        // the full writeup): NetworkFirst on navigations instead, so a
        // live connection always gets the current build, falling back to
        // cache only when genuinely offline.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: /\.(?:js|css)$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "static-assets",
              networkTimeoutSeconds: 5
            }
          }
        ]
      },
      manifest: {
        name: "Jenix Admin Panel",
        short_name: "JenixAdmin",
        description: "Admin PWA for Jenix commerce operations",
        start_url: "/",
        display: "standalone",
        background_color: "#111827",
        theme_color: "#E8231A",
        icons: [
          {
            src: "/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml"
          },
          {
            src: "/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml"
          }
        ]
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 4173
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test-setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/main.jsx", "src/test-setup.js"]
    }
  }
});
