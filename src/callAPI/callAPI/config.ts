// ─────────────────────────────────────────────────────────────────────────────
// callAPI / config.ts
// ICE server configuration and call constants.
//
// STUN servers: resolve public IP behind NAT (free, no setup).
// TURN servers: relay media when STUN fails (symmetric NAT / corporate firewall).
//
// To add your own TURN server (recommended for production):
//   1. Spin up coturn:  https://github.com/coturn/coturn
//   2. Or use Twilio Network Traversal Service, Metered TURN, etc.
//   3. Replace the credentials below.
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum call duration enforced client-side (30 min) */
export const MAX_CALL_DURATION_SECONDS = 30 * 60;

/** How long the caller waits before auto-cancelling (60 s) */
export const CALL_RING_TIMEOUT_MS = 60_000;

/** MediaStream constraints per call kind */
export const MEDIA_CONSTRAINTS: Record<"audio" | "video", MediaStreamConstraints> = {
  audio: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
    },
    video: false,
  },
  video: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
    },
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
      facingMode: "user",
    },
  },
};

/**
 * ICE server list used when creating RTCPeerConnection.
 *
 * Current setup:
 *  - 3× Google STUN  (free, no auth)
 *  - Open Relay TURN (free public relay — fine for dev/demo)
 *
 * Production note: replace Open Relay with a private TURN server.
 * If TURN_URL / TURN_USERNAME / TURN_CREDENTIAL env vars are present
 * (injected via VITE_* prefix), they are added automatically.
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Free public TURN relay (Open Relay Project)
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turns:openrelay.metered.ca:443",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  // Optional: inject a private TURN server via Vite env vars.
  // Set VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL in .env
  const turnUrl = import.meta.env?.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: import.meta.env?.VITE_TURN_USERNAME ?? "",
      credential: import.meta.env?.VITE_TURN_CREDENTIAL ?? "",
    });
  }

  return servers;
}

/** RTCPeerConnection config built from getIceServers() */
export function getRTCConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}
