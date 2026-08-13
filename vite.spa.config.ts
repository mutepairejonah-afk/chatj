/**
 * Vite SPA config for Capacitor (iOS / Android) builds.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname ?? __dirname, "src"),
      // Mock all Node.js modules
      "node:async_hooks": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "async_hooks": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
    },
  },

  define: {
    "global": "globalThis",
    "process.env": JSON.stringify({
      NODE_ENV: "production",
      VITE_API_URL: process.env.VITE_API_URL || "https://chatj.onrender.com",
    }),
    // Mock server-only imports
    "import.meta.env.SSR": false,
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
      external: [
        "node:async_hooks",
        "async_hooks",
        "node:fs",
        "node:path",
        "node:os",
        "node:util",
        "node:stream",
        "node:events",
      ],
    },
    chunkSizeWarningLimit: 1200,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.VITE_API_URL ?? "http://localhost:3001",
        changeOrigin: true,
        ws: true,
      },
    },
  },

  optimizeDeps: {
    exclude: [
      "@tanstack/start-storage-context",
      "@tanstack/start-server",
      "@tanstack/start",
      "node:async_hooks",
      "async_hooks",
    ],
  },
});
