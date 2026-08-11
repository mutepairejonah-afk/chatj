// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// Custom plugin: attach our Socket.io server to Vite's underlying HTTP server
// so it shares port 5000 with the rest of the app (single port, no CORS).
function socketIoPlugin(): Plugin {
  return {
    name: "socket-io-server",
    configureServer(server) {
      if (!server.httpServer) return;
      server.httpServer.once("listening", async () => {
        const { attachSocketServer } = await import("./src/server/socket");
        attachSocketServer(server.httpServer as any);
        console.log("[socket.io] attached on /socket.io (port 5000)");

        // Also listen on a dedicated signaling port (SIGNALING_PORT, default
        // 5001). The native/Expo app talks to EXPO_PUBLIC_API_URL, which
        // points at this port — without this, calls from the native app
        // have nothing to connect to even though the web app "works".
        // attachSocketServer() reuses the same io instance/rooms, so web
        // and native clients can signal each other normally.
        const signalingPort = Number(process.env.SIGNALING_PORT) || 5001;
        const { createServer } = await import("node:http");
        const signalingServer = createServer((req, res) => {
          if (req.url === "/health") { res.writeHead(200); res.end("ok"); return; }
          res.writeHead(404); res.end();
        });
        signalingServer.on("error", (err) => {
          console.error(`[socket.io] signaling port ${signalingPort} failed to bind:`, (err as Error).message);
        });
        signalingServer.listen(signalingPort, "0.0.0.0", () => {
          attachSocketServer(signalingServer as any);
          console.log(`[socket.io] attached on /socket.io (port ${signalingPort}, for native/signaling clients)`);
        });
      });
    },
  };
}

export default defineConfig({
  vite: {
    server: {
      port: 5000,
      host: "0.0.0.0",
      allowedHosts: true,
      // Keep the HMR connection alive longer — prevents false "server connection lost" messages
      hmr: {
        timeout: 30000,
        overlay: false,
      },
      // Don't watch the SSR output folder or node_modules (reduces spurious restarts)
      watch: {
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/.vinxi/**",
          "**/.output/**",
        ],
      },
      // Proxy REST API + WebSocket to the standalone Express backend.
      // The backend runs on port 3001 (pnpm run backend:dev).
      // When VITE_API_URL is empty (default dev), the frontend calls /api/* on
      // same-origin and this proxy forwards them to the backend server.
      proxy: {
        "/api": {
          target: process.env.BACKEND_ORIGIN ?? "http://localhost:3001",
          changeOrigin: true,
          // Gracefully swallow ECONNREFUSED so a missing backend doesn't crash
          // the Vite dev server — API calls will just fail in the browser.
          configure(proxy) {
            proxy.on("error", (err, _req, res) => {
              const msg = (err as NodeJS.ErrnoException).code === "ECONNREFUSED"
                ? "backend not running"
                : err.message;
              console.warn(`[proxy /api] ${msg}`);
              if (res && "writeHead" in res && !(res as any).headersSent) {
                (res as any).writeHead(503, { "Content-Type": "application/json" });
                (res as any).end(JSON.stringify({ error: "Backend unavailable", detail: msg }));
              }
            });
          },
        },
      },
    },
    plugins: [socketIoPlugin()],
    ssr: {
      noExternal: ["framer-motion", "motion-dom", "motion-utils", "motion"],
    },
    optimizeDeps: {
      include: ["framer-motion", "motion-dom", "motion-utils"],
    },
  },
});
