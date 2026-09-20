// Client-only service worker registration. Imported for its side effect from
// router.tsx; the guards make it a no-op during SSR, dev, and on browsers
// without service worker support. The sw.js itself is emitted by
// vite-plugin-pwa at build time (see vite.config.ts).
if (typeof window !== "undefined" && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}

export {};
