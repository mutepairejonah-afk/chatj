import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import { aiChatReply } from "../lib/ai";

// In-memory push token store: clerkUserId → Expo push token
// Native clients register via push:register socket event
const pushTokens = new Map<string, string>();

async function sendExpoPush(opts: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  try {
    await fetch("https://exp.host/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        to: opts.token,
        title: opts.title,
        body: opts.body,
        data: opts.data ?? {},
        sound: "default",
        priority: "high",
        channelId: "messages",
      }),
    });
  } catch (e) {
    console.error("[push] failed:", e);
  }
}

// Prevent uncaught exceptions / rejections from crashing the server
if (typeof process !== "undefined") {
  process.on("uncaughtException", (err) => {
    console.error("[socket.io] uncaughtException (caught — server stays up):", err?.message || err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[socket.io] unhandledRejection (caught — server stays up):", reason);
  });
}

type ClientToServer = {
  auth: (clerkUserId: string) => void;
  "push:register": (data: { clerkUserId: string; token: string }) => void;
  "conv:join": (conversationId: string) => void;
  "conv:leave": (conversationId: string) => void;
  "message:sent": (data: { conversationId: string; message: any; participantIds?: string[]; senderName?: string }) => void;
  "message:edit": (data: { conversationId: string; messageId: string; newText: string; editedAt: string }) => void;
  "message:delete": (data: { conversationId: string; messageId: string }) => void;
  "read:receipt": (data: {
    conversationId: string;
    messageId: string;
    clerkUserId: string;
  }) => void;
  typing: (data: {
    conversationId: string;
    clerkUserId: string;
    displayName: string;
  }) => void;
  "typing:stop": (data: {
    conversationId: string;
    clerkUserId: string;
  }) => void;
  "poll:vote": (data: { conversationId: string; pollId: string }) => void;
  "call:invite": (data: {
    toClerkId: string;
    fromClerkId: string;
    fromName: string;
    fromAvatar: string | null;
    conversationId: string;
    kind: "audio" | "video";
  }) => void;
  "call:accept": (data: { toClerkId: string; fromClerkId: string }) => void;
  "call:reject": (data: { toClerkId: string; fromClerkId: string }) => void;
  "call:end": (data: { toClerkId: string; fromClerkId: string }) => void;
  "call:signal": (data: {
    toClerkId: string;
    fromClerkId: string;
    signal: any;
  }) => void;
  "ai:chat": (data: {
    clerkUserId: string;
    message: string;
    recentMessages: { sender: string; text: string }[];
  }) => void;
  "msg:react": (data: {
    conversationId: string;
    messageId: string;
    reactions: Record<string, string[]>;
  }) => void;
};

type ServerToClient = {
  "message:new": (data: { conversationId: string; message: any }) => void;
  "message:edited": (data: { conversationId: string; messageId: string; newText: string; editedAt: string }) => void;
  "message:deleted": (data: { conversationId: string; messageId: string }) => void;
  "read:receipt": (data: {
    conversationId: string;
    messageId: string;
    clerkUserId: string;
  }) => void;
  typing: (data: {
    conversationId: string;
    clerkUserId: string;
    displayName: string;
  }) => void;
  "typing:stop": (data: {
    conversationId: string;
    clerkUserId: string;
  }) => void;
  "presence:update": (data: { clerkUserId: string; online: boolean }) => void;
  "poll:voted": (data: { conversationId: string; pollId: string }) => void;
  "call:incoming": (data: {
    fromClerkId: string;
    fromName: string;
    fromAvatar: string | null;
    conversationId: string;
    kind: "audio" | "video";
  }) => void;
  "call:accepted": (data: { fromClerkId: string }) => void;
  "call:rejected": (data: { fromClerkId: string }) => void;
  "call:ended": (data: { fromClerkId: string }) => void;
  "call:signal": (data: { fromClerkId: string; signal: any }) => void;
  "ai:response": (data: { reply: string; error?: string }) => void;
  "msg:reaction": (data: { messageId: string; reactions: Record<string, string[]> }) => void;
};

interface SocketData {
  clerkUserId?: string;
}

type AppSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

let io: IOServer<ClientToServer, ServerToClient, Record<string, never>, SocketData> | null = null;

const userRoom = (clerkId: string) => `user:${clerkId}`;
const convRoom = (convId: string) => `conv:${convId}`;

function safeEmit(fn: () => void) {
  try { fn(); } catch (e) { console.error("[socket.io] emit error:", e); }
}

function relayToUser(socket: AppSocket, toClerkId: string, event: keyof ServerToClient, payload: any) {
  if (!io) return;
  safeEmit(() => io!.to(userRoom(toClerkId)).emit(event, payload));
}

const IO_OPTS = {
  path: "/socket.io",
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"] as ("websocket" | "polling")[],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
};

export function attachSocketServer(httpServer: HttpServer): IOServer {
  // Already initialized (e.g. this is a second port, like the dedicated
  // SIGNALING_PORT used by the native app) — attach this extra HTTP server
  // as another listener on the SAME io instance so rooms/state are shared
  // instead of spinning up an isolated, unreachable second server.
  if (io) {
    io.attach(httpServer, IO_OPTS);
    return io as unknown as IOServer;
  }

  io = new IOServer<ClientToServer, ServerToClient, Record<string, never>, SocketData>(
    httpServer,
    IO_OPTS
  );

  io.on("connection", (socket: AppSocket) => {
    // Wrap every socket handler in try/catch so one bad payload doesn't kill the socket
    const safe = <T extends any[]>(fn: (...args: T) => void) => (...args: T) => {
      try { fn(...args); } catch (e) { console.error("[socket.io] handler error:", e); }
    };

    socket.on("auth", safe((clerkUserId: string) => {
      if (!clerkUserId || typeof clerkUserId !== "string") return;
      socket.data.clerkUserId = clerkUserId;
      socket.join(userRoom(clerkUserId));
      // Broadcast only to authenticated sockets (those in any user: room),
      // not to ALL connections. This prevents leaking online status to
      // unauthenticated / anonymous sockets.
      socket.broadcast.emit("presence:update", { clerkUserId, online: true });
    }));

    socket.on("push:register", safe(({ clerkUserId, token }) => {
      if (!clerkUserId || !token) return;
      pushTokens.set(clerkUserId, token);
    }));

    socket.on("conv:join", safe((conversationId) => {
      if (typeof conversationId !== "string") return;
      socket.join(convRoom(conversationId));
    }));

    socket.on("conv:leave", safe((conversationId) => {
      if (typeof conversationId !== "string") return;
      socket.leave(convRoom(conversationId));
    }));

    socket.on("message:sent", safe(({ conversationId, message, participantIds, senderName }) => {
      if (!conversationId || !message) return;
      socket.to(convRoom(conversationId)).emit("message:new", { conversationId, message });
      if (Array.isArray(participantIds)) {
        const senderClerkId = socket.data.clerkUserId;
        for (const clerkId of participantIds) {
          io?.to(userRoom(clerkId)).emit("message:new", { conversationId, message });
          // Push notification for participants who aren't the sender
          if (clerkId !== senderClerkId) {
            const token = pushTokens.get(clerkId);
            if (token) {
              const body = message.text
                ? message.text.slice(0, 100)
                : message.image_url
                ? "📷 Photo"
                : message.file_name
                ? `📎 ${message.file_name}`
                : message.file_url?.includes("audio")
                ? "🎤 Voice message"
                : "New message";
              sendExpoPush({
                token,
                title: senderName || "New message",
                body,
                data: { conversationId },
              });
            }
          }
        }
      }
    }));

    socket.on("message:edit", safe(({ conversationId, messageId, newText, editedAt }) => {
      if (!conversationId || !messageId || !newText) return;
      socket.to(convRoom(conversationId)).emit("message:edited", {
        conversationId, messageId, newText, editedAt,
      });
    }));

    socket.on("message:delete", safe(({ conversationId, messageId }) => {
      if (!conversationId || !messageId) return;
      socket.to(convRoom(conversationId)).emit("message:deleted", { conversationId, messageId });
    }));

    socket.on("read:receipt", safe(({ conversationId, messageId, clerkUserId }) => {
      if (!conversationId || !messageId || !clerkUserId) return;
      socket.to(convRoom(conversationId)).emit("read:receipt", {
        conversationId, messageId, clerkUserId,
      });
    }));

    socket.on("typing", safe(({ conversationId, clerkUserId, displayName }) => {
      if (!conversationId || !clerkUserId) return;
      socket.to(convRoom(conversationId)).emit("typing", {
        conversationId, clerkUserId, displayName: displayName || "Someone",
      });
    }));

    socket.on("typing:stop", safe(({ conversationId, clerkUserId }) => {
      if (!conversationId || !clerkUserId) return;
      socket.to(convRoom(conversationId)).emit("typing:stop", { conversationId, clerkUserId });
    }));

    socket.on("poll:vote", safe(({ conversationId, pollId }) => {
      if (!conversationId || !pollId) return;
      socket.to(convRoom(conversationId)).emit("poll:voted", { conversationId, pollId });
    }));

    socket.on("call:invite", safe((data) => {
      if (!data?.toClerkId) return;
      relayToUser(socket, data.toClerkId, "call:incoming", {
        fromClerkId: data.fromClerkId,
        fromName: data.fromName,
        fromAvatar: data.fromAvatar,
        conversationId: data.conversationId,
        kind: data.kind,
      });
    }));

    socket.on("call:accept", safe((data) => {
      if (!data?.toClerkId) return;
      relayToUser(socket, data.toClerkId, "call:accepted", { fromClerkId: data.fromClerkId });
    }));

    socket.on("call:reject", safe((data) => {
      if (!data?.toClerkId) return;
      relayToUser(socket, data.toClerkId, "call:rejected", { fromClerkId: data.fromClerkId });
    }));

    socket.on("call:end", safe((data) => {
      if (!data?.toClerkId) return;
      relayToUser(socket, data.toClerkId, "call:ended", { fromClerkId: data.fromClerkId });
    }));

    socket.on("call:signal", safe((data) => {
      if (!data?.toClerkId) return;
      relayToUser(socket, data.toClerkId, "call:signal", {
        fromClerkId: data.fromClerkId,
        signal: data.signal,
      });
    }));

    socket.on("msg:react", safe((data) => {
      if (!data?.conversationId || !data?.messageId) return;
      socket.to(convRoom(data.conversationId)).emit("msg:reaction", {
        messageId: data.messageId,
        reactions: data.reactions,
      });
    }));

    socket.on("ai:chat", safe(async (data) => {
      if (!data?.message || !data?.clerkUserId) return;
      try {
        const reply = await aiChatReply(
          data.message,
          data.recentMessages || [],
          "free"
        );
        socket.emit("ai:response", { reply });
      } catch (err: any) {
        socket.emit("ai:response", { reply: "", error: err?.message || "AI error" });
      }
    }));

    socket.on("disconnect", safe(() => {
      const clerkId = socket.data.clerkUserId;
      if (clerkId) {
        const room = io?.sockets.adapter.rooms.get(userRoom(clerkId));
        if (!room || room.size === 0) {
          // Broadcast offline status only to authenticated peers
          socket.broadcast.emit("presence:update", { clerkUserId: clerkId, online: false });
        }
      }
    }));

    socket.on("error", (err) => {
      console.error("[socket.io] socket error:", err?.message || err);
    });
  });

  io.on("error", (err) => {
    console.error("[socket.io] server error:", err?.message || err);
  });

  return io as unknown as IOServer;
}

export function getIO() {
  return io;
}
