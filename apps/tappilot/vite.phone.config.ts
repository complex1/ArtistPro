import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon-32.png",
        "icons/apple-touch-icon.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
      ],
      manifest: {
        id: "/",
        name: "TapPilot",
        short_name: "TapPilot",
        description:
          "Phone remote for TapPilot — control desktop shortcuts over Wi‑Fi",
        theme_color: "#05070d",
        background_color: "#05070d",
        display: "standalone",
        display_override: ["standalone", "fullscreen", "browser"],
        orientation: "any",
        // Relative paths match Vite base "./" so install works from the LAN URL.
        start_url: "./",
        scope: "./",
        lang: "en",
        categories: ["utilities", "productivity"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the built shell; never cache the desktop API.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}"],
        // Lucide icon pack is bundled for offline widget glyphs.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws"),
            handler: "NetworkOnly",
          },
        ],
      },
      // Keep SW off in Vite phone-dev (API is on another port).
      devOptions: {
        enabled: false,
      },
    }),
  ],
  root: path.join(appRoot, "phone"),
  base: "./",
  // Separate cache per dev server; a shared one makes each server invalidate
  // the other's optimized deps (504 Outdated Optimize Dep).
  cacheDir: path.resolve(appRoot, "../../node_modules/.vite/tappilot-phone"),
  resolve: {
    alias: {
      "@shared": path.resolve(appRoot, "shared"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@iconify/react",
    ],
  },
  build: {
    outDir: path.resolve(appRoot, "../../dist-tappilot-phone"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
});
