// ─────────────────────────────────────────────────────────────────────────────
// callAPI / hooks.ts
// React hooks that encapsulate the full audio/video call lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { PeerConnection } from "./webrtc";
import {
  emitCallInvite,
  emitCallAccept,
  emitCallReject,
  emitCallEnd,
  emitSdp,
  emitIceCandidate,
  listenToCallEvents,
} from "./signaling";
import { logCall } from "./db";
import type {
  CallKind,
  CallOutcome,
  CallStatus,
  CallSession,
  CallInvitePayload,
} from "./types";
import { CALL_RING_TIMEOUT_MS } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// useCallSession
// ─────────────────────────────────────────────────────────────────────────────

export interface UseCallSessionOptions {
  /** Your own Clerk user ID */
  myClerkId: string;
  /** Call session metadata (role, kind, peer info, etc.) */
  session: CallSession;
  /** Socket.io socket (from getSocket(myClerkId)) */
  socket: Socket;
  /** Called when the call ends (use to unmount the CallModal) */
  onClose: () => void;
}

export interface UseCallSessionReturn {
  status: CallStatus;
  muted: boolean;
  cameraOff: boolean;
  elapsed: number; // seconds since connection
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  endCall: (notifyPeer?: boolean) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

/**
 * Full call lifecycle hook.
 * Mount this inside the CallModal component (or equivalent).
 *
 * Handles:
 *  - getUserMedia (audio + optional video)
 *  - RTCPeerConnection creation + ICE negotiation
 *  - SDP offer/answer exchange via Socket.io
 *  - Mute, camera on/off, elapsed timer
 *  - Call logging to Supabase (caller-only to avoid duplicates)
 */
export function useCallSession({
  myClerkId,
  session,
  socket,
  onClose,
}: UseCallSessionOptions): UseCallSessionReturn {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const pcRef = useRef<PeerConnection | null>(null);
  const [status, setStatus] = useState<CallStatus>("ringing");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // ── Call-log tracking ──────────────────────────────────────────────────────
  const startedAt = useRef(new Date().toISOString());
  const connectedAt = useRef<number | null>(null);
  const outcome = useRef<CallOutcome>("cancelled");
  const logged = useRef(false);

  const writeLog = useCallback(() => {
    if (logged.current || session.role !== "caller") return;
    logged.current = true;
    const duration = connectedAt.current
      ? Math.max(0, Math.round((Date.now() - connectedAt.current) / 1000))
      : 0;
    logCall({
      data: {
        conversationId: session.conversationId,
        callerClerkId: myClerkId,
        calleeClerkId: session.peerClerkId,
        kind: session.kind,
        status: outcome.current,
        durationSeconds: duration,
        startedAt: startedAt.current,
      },
    }).catch(() => {});
  }, [myClerkId, session]);

  // ── End call ───────────────────────────────────────────────────────────────
  const endCall = useCallback(
    (notifyPeer = true) => {
      if (notifyPeer) emitCallEnd(socket, myClerkId, session.peerClerkId);
      if (!connectedAt.current && outcome.current === "cancelled") {
        outcome.current = session.role === "caller" ? "missed" : "cancelled";
      }
      writeLog();
      pcRef.current?.destroy();
      pcRef.current = null;
      setStatus("ended");
      onClose();
    },
    [socket, myClerkId, session.peerClerkId, session.role, writeLog, onClose]
  );

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "connected") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  // ── Ring timeout (auto-cancel after CALL_RING_TIMEOUT_MS) ──────────────────
  useEffect(() => {
    if (status !== "ringing" || session.role !== "caller") return;
    const t = setTimeout(() => endCall(true), CALL_RING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, session.role, endCall]);

  // ── Main WebRTC setup + signaling ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const pc = new PeerConnection({
      kind: session.kind,

      onIceCandidate: (candidate) =>
        emitIceCandidate(socket, myClerkId, session.peerClerkId, candidate),

      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      },

      onConnectionStateChange: (state) => {
        if (state === "connected") {
          setStatus("connected");
          if (!connectedAt.current) {
            connectedAt.current = Date.now();
            outcome.current = "answered";
          }
        }
        if (state === "failed" || state === "disconnected" || state === "closed") {
          writeLog();
          pc.destroy();
          setStatus("ended");
          onClose();
        }
      },
    });
    pcRef.current = pc;

    // ── Attach signaling listeners ──────────────────────────────────────
    const removeListeners = listenToCallEvents(socket, {
      onSignal: async (data) => {
        if (data.fromClerkId !== session.peerClerkId) return;
        const sig = data.signal;

        if (sig.type === "sdp") {
          if (sig.sdp.type === "answer") {
            // Caller receives callee's SDP answer
            await pc.setRemoteAnswer(sig.sdp);
            setStatus("connecting");
          } else if (sig.sdp.type === "offer") {
            // Callee receives caller's SDP offer
            const answer = await pc.answerOffer(sig.sdp);
            if (answer) {
              emitSdp(socket, myClerkId, session.peerClerkId, answer);
              setStatus("connecting");
            }
          }
        } else if (sig.type === "ice") {
          await pc.addIceCandidate(sig.candidate);
        }
      },

      onAccepted: (data) => {
        if (data.fromClerkId !== session.peerClerkId) return;
        setStatus((s) => (s === "ringing" ? "connecting" : s));
      },

      onRejected: (data) => {
        if (data.fromClerkId !== session.peerClerkId) return;
        outcome.current = "rejected";
        writeLog();
        pc.destroy();
        setStatus("ended");
        onClose();
      },

      onEnded: (data) => {
        if (data.fromClerkId !== session.peerClerkId) return;
        if (!connectedAt.current && outcome.current === "cancelled") {
          outcome.current = session.role === "caller" ? "missed" : "cancelled";
        }
        writeLog();
        pc.destroy();
        setStatus("ended");
        onClose();
      },
    });

    // ── Get media + start negotiation ───────────────────────────────────
    (async () => {
      try {
        const stream = await pc.startLocalMedia();
        if (cancelled) { pc.destroy(); return; }

        if (localVideoRef.current && session.kind === "video") {
          localVideoRef.current.srcObject = stream;
        }

        if (session.role === "caller") {
          const offer = await pc.createOffer();
          emitSdp(socket, myClerkId, session.peerClerkId, offer);
          setStatus("ringing");
        } else {
          // Callee: use buffered initial offer if available
          const offer = session.initialOffer ?? null;
          if (offer) {
            const answer = await pc.answerOffer(offer);
            if (answer) {
              emitSdp(socket, myClerkId, session.peerClerkId, answer);
              setStatus("connecting");
            }
          }
        }
      } catch (err) {
        console.error("[callAPI] getUserMedia failed:", err);
        if (!cancelled) endCall(true);
      }
    })();

    return () => {
      cancelled = true;
      removeListeners();
      pc.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only runs once — session/socket refs are stable

  // ── Controls ───────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      pcRef.current?.setMuted(!m);
      return !m;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOff((off) => {
      pcRef.current?.setCameraEnabled(off); // if currently off, enable it
      return !off;
    });
  }, []);

  return {
    status,
    muted,
    cameraOff,
    elapsed,
    localVideoRef,
    remoteVideoRef,
    endCall,
    toggleMute,
    toggleCamera,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useIncomingCall
// ─────────────────────────────────────────────────────────────────────────────

export interface UseIncomingCallReturn {
  incoming: CallInvitePayload | null;
  accept: () => void;
  reject: () => void;
}

/**
 * Listen for incoming call invites on a shared socket.
 * Mount this once at the layout level (MobileLayout) so calls ring on every page.
 *
 * @param socket    Shared Socket.io connection
 * @param myClerkId Your Clerk user ID
 * @param onAccept  Called with a CallSession when the user accepts — use this
 *                  to mount your CallModal
 */
export function useIncomingCall(
  socket: Socket | null,
  myClerkId: string,
  onAccept: (session: CallSession) => void
): UseIncomingCallReturn {
  const [incoming, setIncoming] = useState<CallInvitePayload | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handler = (data: CallInvitePayload) => {
      setIncoming(data);
    };

    socket.on("call:incoming", handler);
    return () => { socket.off("call:incoming", handler); };
  }, [socket]);

  const accept = useCallback(() => {
    if (!incoming || !socket) return;
    emitCallAccept(socket, myClerkId, incoming.fromClerkId);
    onAccept({
      role: "callee",
      kind: incoming.kind,
      peerClerkId: incoming.fromClerkId,
      peerName: incoming.fromName,
      peerAvatar: incoming.fromAvatar,
      conversationId: incoming.conversationId,
      initialOffer: incoming.offer,
    });
    setIncoming(null);
  }, [incoming, socket, myClerkId, onAccept]);

  const reject = useCallback(() => {
    if (!incoming || !socket) return;
    emitCallReject(socket, myClerkId, incoming.fromClerkId);
    setIncoming(null);
  }, [incoming, socket, myClerkId]);

  return { incoming, accept, reject };
}

// ─────────────────────────────────────────────────────────────────────────────
// useStartCall
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a function that initiates an outgoing call.
 *
 * Usage:
 *   const startCall = useStartCall(socket, myClerkId, myName, myAvatar, onCallStarted);
 *   <button onClick={() => startCall({ toClerkId, peerName, peerAvatar, conversationId, kind: "video" })} />
 */
export function useStartCall(
  socket: Socket | null,
  myClerkId: string,
  myName: string,
  myAvatar: string | null,
  onCallStarted: (session: CallSession) => void
) {
  return useCallback(
    (opts: {
      toClerkId: string;
      peerName: string;
      peerAvatar: string | null;
      conversationId: string;
      kind: CallKind;
    }) => {
      if (!socket) return;

      const session: CallSession = {
        role: "caller",
        kind: opts.kind,
        peerClerkId: opts.toClerkId,
        peerName: opts.peerName,
        peerAvatar: opts.peerAvatar,
        conversationId: opts.conversationId,
      };

      emitCallInvite(socket, {
        myClerkId,
        toClerkId: opts.toClerkId,
        myName,
        myAvatar,
        conversationId: opts.conversationId,
        kind: opts.kind,
      });

      onCallStarted(session);
    },
    [socket, myClerkId, myName, myAvatar, onCallStarted]
  );
}
