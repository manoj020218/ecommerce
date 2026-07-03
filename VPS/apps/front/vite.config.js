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
        runtimeCaching: [
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
