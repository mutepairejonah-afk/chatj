import { io, type Socket } from "socket.io-client";

// Resolve backend URL — falls back to same origin so the existing
// TanStack Start SSR setup keeps working in dev without VITE_API_URL.
const SOCKET_URL = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

let socket: Socket | null = null;
let currentUserId: string | null = null;

/**
 * Returns a singleton Socket.io client, lazily connecting on first use.
 * Re-auths if the userId changes.
 *
 * When VITE_API_URL is set the socket connects to the remote backend;
 * otherwise it connects to the same origin (legacy / monolith mode).
 */
export function getSocket(clerkUserId: string | null | undefined): Socket | null {
  if (typeof window === "undefined") return null; // SSR no-op
  if (!clerkUserId) return null;

  if (!socket) {
    socket = io(SOCKET_URL || undefined!, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      // Avoid triggering a full page reload on reconnect
      forceNew: false,
    });

    socket.on("connect", () => {
      if (currentUserId) socket?.emit("auth", currentUserId);
    });

    socket.on("connect_error", (err) => {
      // Don't console.error on every retry — only log occasionally
      if (Math.random() < 0.1) console.warn("[socket] connect_error:", err?.message);
    });
  }

  if (currentUserId !== clerkUserId) {
    currentUserId = clerkUserId;
    if (socket.connected) socket.emit("auth", clerkUserId);
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentUserId = null;
  }
}
