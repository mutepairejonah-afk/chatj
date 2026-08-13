/**
 * Vite SPA config for Capacitor (iOS / Android) builds.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname ?? __dirname, "src"),
      // Mock Node.js modules for browser
      "node:async_hooks": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "async_hooks": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "node:fs": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "node:path": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "node:os": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "node:util": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "node:stream": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "node:events": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
      "node:buffer": path.resolve(import.meta.dirname ?? __dirname, "src/mocks/empty-module.js"),
    },
  },

  define: {
    "global": "globalThis",
    "process.env": JSON.stringify({
      NODE_ENV: "production",
      VITE_API_URL: process.env.VITE_API_URL || "https://chatj.onrender.com",
    }),
    // Force client-side only
    "import.meta.env.SSR": false,
    "import.meta.env.VITE_SERVER_URL": JSON.stringify(process.env.VITE_API_URL || "https://chatj.onrender.com"),
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
        "node:buffer",
        "node:net",
        "node:tls",
        "node:crypto",
        "node:zlib",
        "node:http",
        "node:https",
        "node:url",
        "node:querystring",
      ],
    },
    chunkSizeWarningLimit: 1200,
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/],
    },
    // Ensure all server-only code is excluded
    target: "es2020",
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
      "@tanstack/react-start",
      "@tanstack/start-storage-context",
      "@tanstack/start-server",
      "@clerk/tanstack-start",
      "node:async_hooks",
      "async_hooks",
      "pg",
    ],
    include: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "socket.io-client",
    ],
  },

  // Add this to handle server-only imports
  ssr: {
    noExternal: [],
    external: [
      "@tanstack/react-start",
      "@clerk/tanstack-start",
      "pg",
      "node:async_hooks",
      "async_hooks",
    ],
  },
});
