// ─────────────────────────────────────────────────────────────────────────────
// callAPI — main entry point
//
// Import everything from here:
//   import { PeerConnection, useCallSession, useIncomingCall, logCall } from "@/callAPI";
//
// Module overview:
//
//   types.ts      — TypeScript types (CallSession, CallKind, CallStatus, …)
//   config.ts     — ICE servers, media constraints, ring timeout constant
//   webrtc.ts     — PeerConnection class (RTCPeerConnection lifecycle manager)
//   signaling.ts  — Socket.io emit/listen helpers (invite, accept, reject, end, signal)
//   db.ts         — Supabase server functions (logCall, getCallHistory, …)
//   hooks.ts      — React hooks (useCallSession, useIncomingCall, useStartCall)
// ─────────────────────────────────────────────────────────────────────────────

// Types
export type {
  CallKind,
  CallOutcome,
  CallStatus,
  CallSession,
  CallInvitePayload,
  CallSignalPayload,
  SdpSignal,
  IceSignal,
  CallLogEntry,
  PeerConnectionOptions,
} from "./types";

// Config
export {
  MAX_CALL_DURATION_SECONDS,
  CALL_RING_TIMEOUT_MS,
  MEDIA_CONSTRAINTS,
  getIceServers,
  getRTCConfig,
} from "./config";

// WebRTC
export { PeerConnection } from "./webrtc";

// Signaling
export {
  emitCallInvite,
  emitCallAccept,
  emitCallReject,
  emitCallEnd,
  emitSdp,
  emitIceCandidate,
  listenToCallEvents,
} from "./signaling";
export type { CallListeners } from "./signaling";

// Database
export {
  logCall,
  getCallHistory,
  deleteCallLog,
  clearCallHistory,
  formatDuration,
  formatCallSummary,
} from "./db";

// Hooks
export {
  useCallSession,
  useIncomingCall,
  useStartCall,
} from "./hooks";
export type {
  UseCallSessionOptions,
  UseCallSessionReturn,
  UseIncomingCallReturn,
} from "./hooks";
