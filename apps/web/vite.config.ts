import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    varlockVitePlugin({ ssrInjectMode: "resolved-env" }),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
    VitePWA({
      // Nitro (not Vite) owns the deployable output: the client build lands in
      // .output/public, so the SW must be generated there too.
      outDir: ".output/public",
      // SW is registered manually in src/lib/register-sw.ts (client-only);
      // there is no index.html entry for the plugin to inject into.
      injectRegister: false,
      registerType: "autoUpdate",
      // The 3MB animated brand logo (brand/nestegg-logo.png) stays out of the
      // precache; the landing page fetches it on demand.
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "icons/*.png"],
      manifest: {
        name: "NestEgg",
        short_name: "NestEgg",
        description: "Caretaker dashboard for a member's day-to-day money.",
        theme_color: "#b45309",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        // SSR app: no static index.html to fall back to. Pages are cached at
        // runtime below; /api always goes to the network.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" && !url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  // Bundle all SSR deps at build time only: Vercel functions have no node_modules at runtime
  ssr: process.env.NODE_ENV === "production" ? { noExternal: true } : undefined,
});
