// ─────────────────────────────────────────────────────────────────────────────
// callAPI / types.ts
// All TypeScript types shared across the call API module.
// ─────────────────────────────────────────────────────────────────────────────

/** Whether this is a voice-only or video+voice call */
export type CallKind = "audio" | "video";

/** Lifecycle outcome of a call (written to call_logs) */
export type CallOutcome = "answered" | "missed" | "rejected" | "cancelled";

/** Connection phase visible to the UI */
export type CallStatus = "idle" | "ringing" | "connecting" | "connected" | "ended";

/**
 * All the context needed to start or join a call.
 * Passed from MobileLayout → CallModal, or from the chat header.
 */
export interface CallSession {
  /** "caller" initiates the offer; "callee" answers it */
  role: "caller" | "callee";
  /** Audio-only or video */
  kind: CallKind;
  /** Clerk user ID of the remote peer */
  peerClerkId: string;
  /** Display name of the remote peer (for the call UI) */
  peerName: string;
  /** Avatar URL of the remote peer (may be null) */
  peerAvatar: string | null;
  /** The conversation this call belongs to */
  conversationId: string;
  /**
   * Pre-buffered SDP offer from the invite event.
   * Only populated for the callee when the offer arrived before the modal mounted.
   */
  initialOffer?: RTCSessionDescriptionInit;
}

/** Payload emitted on `call:invite` */
export interface CallInvitePayload {
  fromClerkId: string;
  fromName: string;
  fromAvatar: string | null;
  conversationId: string;
  kind: CallKind;
  offer?: RTCSessionDescriptionInit;
}

/** Payload for `call:signal` (SDP or ICE) */
export interface CallSignalPayload {
  toClerkId: string;
  fromClerkId: string;
  signal: SdpSignal | IceSignal;
}

export interface SdpSignal {
  type: "sdp";
  sdp: RTCSessionDescriptionInit;
}

export interface IceSignal {
  type: "ice";
  candidate: RTCIceCandidateInit;
}

/** One row from the `call_logs` table, with extra client-side fields */
export interface CallLogEntry {
  id: string;
  conversation_id: string;
  caller_clerk_id: string;
  callee_clerk_id: string;
  kind: CallKind;
  status: CallOutcome;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
  /** "incoming" if clerkUserId === callee_clerk_id, "outgoing" if caller */
  direction: "incoming" | "outgoing";
  peerClerkId: string;
  peerProfile: {
    clerk_user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
}

/** Options for `createPeerConnection` */
export interface PeerConnectionOptions {
  kind: CallKind;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}
