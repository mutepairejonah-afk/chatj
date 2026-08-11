// ─────────────────────────────────────────────────────────────────────────────
// callAPI / signaling.ts
// Client-side Socket.io signaling helpers.
//
// All call events flow through the app's shared Socket.io connection
// (same port as the Vite dev server — no CORS issues).
//
// Socket events (client → server):
//   call:invite  — caller rings the callee
//   call:accept  — callee picks up
//   call:reject  — callee declines
//   call:end     — either party hangs up
//   call:signal  — SDP offer/answer or ICE candidate
//
// Socket events (server → client):
//   call:incoming  — you are being called
//   call:accepted  — callee answered your call
//   call:rejected  — callee declined your call
//   call:ended     — remote peer hung up
//   call:signal    — SDP or ICE from the remote peer
// ─────────────────────────────────────────────────────────────────────────────

import type { Socket } from "socket.io-client";
import type {
  CallKind,
  CallInvitePayload,
  SdpSignal,
  IceSignal,
} from "./types";

// ── Emit helpers (caller → server) ────────────────────────────────────────────

/**
 * Ring a remote user.
 * The server relays this as `call:incoming` on the callee's socket.
 */
export function emitCallInvite(
  socket: Socket,
  opts: {
    myClerkId: string;
    toClerkId: string;
    myName: string;
    myAvatar: string | null;
    conversationId: string;
    kind: CallKind;
    offer?: RTCSessionDescriptionInit;
  }
): void {
  socket.emit("call:invite", {
    toClerkId: opts.toClerkId,
    fromClerkId: opts.myClerkId,
    fromName: opts.myName,
    fromAvatar: opts.myAvatar,
    conversationId: opts.conversationId,
    kind: opts.kind,
    offer: opts.offer,
  });
}

/**
 * Accept an incoming call.
 * The server relays this as `call:accepted` on the caller's socket.
 */
export function emitCallAccept(
  socket: Socket,
  myClerkId: string,
  toClerkId: string
): void {
  socket.emit("call:accept", { toClerkId, fromClerkId: myClerkId });
}

/**
 * Reject an incoming call.
 * The server relays this as `call:rejected` on the caller's socket.
 */
export function emitCallReject(
  socket: Socket,
  myClerkId: string,
  toClerkId: string
): void {
  socket.emit("call:reject", { toClerkId, fromClerkId: myClerkId });
}

/**
 * Hang up an active call.
 * The server relays this as `call:ended` on the remote socket.
 */
export function emitCallEnd(
  socket: Socket,
  myClerkId: string,
  toClerkId: string
): void {
  socket.emit("call:end", { toClerkId, fromClerkId: myClerkId });
}

/**
 * Send an SDP description (offer or answer) to the remote peer.
 */
export function emitSdp(
  socket: Socket,
  myClerkId: string,
  toClerkId: string,
  sdp: RTCSessionDescriptionInit
): void {
  const signal: SdpSignal = { type: "sdp", sdp };
  socket.emit("call:signal", { toClerkId, fromClerkId: myClerkId, signal });
}

/**
 * Send an ICE candidate to the remote peer.
 */
export function emitIceCandidate(
  socket: Socket,
  myClerkId: string,
  toClerkId: string,
  candidate: RTCIceCandidate
): void {
  const signal: IceSignal = { type: "ice", candidate: candidate.toJSON() };
  socket.emit("call:signal", { toClerkId, fromClerkId: myClerkId, signal });
}

// ── Listener helpers (server → client) ────────────────────────────────────────

export interface CallListeners {
  onIncoming?: (data: CallInvitePayload) => void;
  onAccepted?: (data: { fromClerkId: string }) => void;
  onRejected?: (data: { fromClerkId: string }) => void;
  onEnded?: (data: { fromClerkId: string }) => void;
  onSignal?: (data: { fromClerkId: string; signal: SdpSignal | IceSignal }) => void;
}

/**
 * Attach all call-related listeners to a socket in one call.
 * Returns a cleanup function — call it in your useEffect cleanup.
 *
 * Example:
 *   useEffect(() => {
 *     return listenToCallEvents(socket, {
 *       onIncoming: (data) => setIncoming(data),
 *       onEnded:    ()     => endCall(),
 *     });
 *   }, [socket]);
 */
export function listenToCallEvents(
  socket: Socket,
  listeners: CallListeners
): () => void {
  if (listeners.onIncoming)  socket.on("call:incoming", listeners.onIncoming);
  if (listeners.onAccepted)  socket.on("call:accepted", listeners.onAccepted);
  if (listeners.onRejected)  socket.on("call:rejected", listeners.onRejected);
  if (listeners.onEnded)     socket.on("call:ended",    listeners.onEnded);
  if (listeners.onSignal)    socket.on("call:signal",   listeners.onSignal);

  return () => {
    if (listeners.onIncoming)  socket.off("call:incoming", listeners.onIncoming);
    if (listeners.onAccepted)  socket.off("call:accepted", listeners.onAccepted);
    if (listeners.onRejected)  socket.off("call:rejected", listeners.onRejected);
    if (listeners.onEnded)     socket.off("call:ended",    listeners.onEnded);
    if (listeners.onSignal)    socket.off("call:signal",   listeners.onSignal);
  };
}
