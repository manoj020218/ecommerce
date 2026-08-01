import { defineConfig } from "vite";
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
        // precached index.html (cache-first), which bypasses nginx
        // entirely on repeat visits — including the server-side 301
        // redirects for renamed product slugs. A phone that visited the
        // site once would then open an old Google-indexed product URL,
        // get served the stale cached shell client-side (never hitting
        // nginx's redirect), and show "Product not found" for a product
        // that actually exists under its new slug. Disabling the implicit
        // fallback and handling navigations as NetworkFirst instead keeps
        // offline support (falls back to cache after the timeout) while
        // guaranteeing live users always get a fresh redirect resolution.
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
        name: "Jenix India Store",
        short_name: "JenixStore",
        description: "Jenix customer storefront progressive web app",
        start_url: "/",
        display: "standalone",
        background_color: "#f7f8fb",
        theme_color: "#ff4d4d",
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
    port: 4174
  }
});
