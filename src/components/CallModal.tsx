import { motion } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff } from "lucide-react";
import type { Socket } from "socket.io-client";
import {
  useCallSession,
  type CallSession,
  type CallKind,
} from "@/callAPI/callAPI";

// Re-export types so existing imports from this file continue to work
export type { CallKind, CallSession };

// ─────────────────────────────────────────────────────────────────────────────
// CallModal
// Full-screen active-call UI. Delegates all WebRTC/signaling logic to
// useCallSession from the callAPI module.
// ─────────────────────────────────────────────────────────────────────────────

export function CallModal({
  myClerkId,
  session,
  socket,
  onClose,
}: {
  myClerkId: string;
  session: CallSession;
  socket: Socket;
  onClose: () => void;
}) {
  const {
    status,
    muted,
    cameraOff,
    elapsed,
    localVideoRef,
    remoteVideoRef,
    endCall,
    toggleMute,
    toggleCamera,
  } = useCallSession({ myClerkId, session, socket, onClose });

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  if (status === "ended") return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
    >
      {/* Remote video / avatar */}
      <div className="relative flex-1">
        {/*
          The <video> element is always rendered so remoteVideoRef is always
          bound when onRemoteStream fires. For audio-only calls the element is
          hidden visually but still plays the incoming audio track.
        */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={
            session.kind === "video"
              ? "h-full w-full object-cover"
              : "hidden"
          }
        />

        {/* Avatar overlay for audio calls */}
        {session.kind === "audio" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-800 to-zinc-950">
            <img
              src={session.peerAvatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${session.peerClerkId}`}
              alt=""
              className="h-32 w-32 rounded-full border-4 border-white/10 object-cover"
            />
          </div>
        )}

        {/* PIP local video */}
        {session.kind === "video" && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] h-40 w-28 rounded-xl border border-white/20 object-cover"
          />
        )}

        {/* Header overlay */}
        <div className="absolute left-0 right-0 top-0 flex flex-col items-center gap-1 pt-[max(env(safe-area-inset-top),20px)]">
          <p className="text-lg font-semibold">{session.peerName}</p>
          <p className="text-xs text-white/70">
            {status === "ringing" && (session.role === "caller" ? "Ringing…" : "Incoming call")}
            {status === "connecting" && "Connecting…"}
            {status === "connected" && fmt(elapsed)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-6">
        <button
          onClick={toggleMute}
          className={`flex h-14 w-14 items-center justify-center rounded-full ${muted ? "bg-white text-black" : "bg-white/15 text-white"}`}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {session.kind === "video" && (
          <button
            onClick={toggleCamera}
            className={`flex h-14 w-14 items-center justify-center rounded-full ${cameraOff ? "bg-white text-black" : "bg-white/15 text-white"}`}
            aria-label={cameraOff ? "Camera on" : "Camera off"}
          >
            {cameraOff ? <VideoOff size={22} /> : <VideoIcon size={22} />}
          </button>
        )}

        <button
          onClick={() => endCall(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-white"
          aria-label="End call"
        >
          <PhoneOff size={22} />
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IncomingCallSheet
// Minimal ringing UI shown to the callee before they accept.
// Accept/reject signaling is handled by useIncomingCall in MobileLayout —
// this component only renders the UI and calls the provided callbacks.
// ─────────────────────────────────────────────────────────────────────────────

export function IncomingCallSheet({
  fromName,
  fromAvatar,
  fromClerkId,
  kind,
  onAccept,
  onReject,
}: {
  fromName: string;
  fromAvatar: string | null;
  fromClerkId: string;
  kind: CallKind;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      className="fixed left-1/2 top-[max(env(safe-area-inset-top),16px)] z-[200] -translate-x-1/2"
    >
      <div className="flex w-[92vw] max-w-md items-center gap-3 rounded-2xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-white/10">
        <img
          src={fromAvatar || `https://api.dicebear.com/9.x/avataaars/svg?seed=${fromClerkId}`}
          alt=""
          className="h-12 w-12 rounded-full bg-zinc-800 object-cover"
        />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-white">{fromName}</p>
          <p className="text-xs text-white/60">
            Incoming {kind === "video" ? "video" : "voice"} call…
          </p>
        </div>
        <button
          onClick={onReject}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-white"
          aria-label="Decline"
        >
          <PhoneOff size={18} />
        </button>
        <button
          onClick={onAccept}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white"
          aria-label="Accept"
        >
          <Phone size={18} />
        </button>
      </div>
    </motion.div>
  );
}
