// ─────────────────────────────────────────────────────────────────────────────
// callAPI / webrtc.ts
// RTCPeerConnection lifecycle manager.
//
// Usage (caller):
//   const pc = new PeerConnection({ kind: "video", ...callbacks });
//   await pc.startLocalMedia();
//   const offer = await pc.createOffer();
//   // send offer via signaling, then...
//   await pc.setRemoteAnswer(answer);
//
// Usage (callee):
//   const pc = new PeerConnection({ kind: "video", ...callbacks });
//   await pc.startLocalMedia();
//   await pc.answerOffer(offer); // returns SDP answer to send back
// ─────────────────────────────────────────────────────────────────────────────

import { getRTCConfig, MEDIA_CONSTRAINTS } from "./config";
import type { CallKind, PeerConnectionOptions } from "./types";

export class PeerConnection {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private mediaReady = false;
  private pendingOffer: RTCSessionDescriptionInit | null = null;

  private readonly kind: CallKind;
  private readonly onIceCandidate: PeerConnectionOptions["onIceCandidate"];
  private readonly onRemoteStream: PeerConnectionOptions["onRemoteStream"];
  private readonly onConnectionStateChange: PeerConnectionOptions["onConnectionStateChange"];

  constructor(options: PeerConnectionOptions) {
    this.kind = options.kind;
    this.onIceCandidate = options.onIceCandidate;
    this.onRemoteStream = options.onRemoteStream;
    this.onConnectionStateChange = options.onConnectionStateChange;

    this.pc = new RTCPeerConnection(getRTCConfig());
    this.attachHandlers();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private attachHandlers() {
    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) this.onIceCandidate(ev.candidate);
    };

    this.pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) this.onRemoteStream(stream);
    };

    this.pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(this.pc.connectionState);
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Acquire camera / microphone access and add tracks to the peer connection.
   * Must be called before createOffer() or answerOffer().
   * @returns The local MediaStream (assign to a <video>.srcObject to preview)
   */
  async startLocalMedia(): Promise<MediaStream> {
    const constraints = MEDIA_CONSTRAINTS[this.kind];
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.localStream = stream;
    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
    this.mediaReady = true;

    // Process a stashed offer (callee race: offer arrived before media was ready)
    if (this.pendingOffer) {
      await this._processOffer(this.pendingOffer);
      this.pendingOffer = null;
    }

    return stream;
  }

  /**
   * Enumerate available camera and microphone devices.
   */
  static async getDevices(): Promise<{
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
  }> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      cameras: all.filter((d) => d.kind === "videoinput"),
      microphones: all.filter((d) => d.kind === "audioinput"),
    };
  }

  /**
   * Caller: create an SDP offer to send to the callee.
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this.kind === "video",
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Caller: receive the callee's SDP answer.
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.remoteDescriptionSet = true;
    await this.drainIceCandidates();
  }

  /**
   * Callee: receive the caller's SDP offer and return an answer.
   * If media isn't ready yet, the offer is stashed and processed once
   * startLocalMedia() completes (avoids race conditions).
   */
  async answerOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit | null> {
    if (!this.mediaReady) {
      this.pendingOffer = offer;
      return null; // answer will be created inside startLocalMedia()
    }
    return this._processOffer(offer);
  }

  private async _processOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescriptionSet = true;
    await this.drainIceCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /**
   * Add a remote ICE candidate received from the signaling channel.
   * Candidates are queued until the remote description is set.
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescriptionSet) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("[callAPI] ICE candidate rejected:", err);
    }
  }

  private async drainIceCandidates(): Promise<void> {
    for (const c of this.pendingIceCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {}
    }
    this.pendingIceCandidates = [];
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  /** Mute / unmute the local microphone */
  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  /** Enable / disable the local camera */
  setCameraEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  /**
   * Switch between front and rear cameras (mobile).
   * Re-acquires the stream with the new facing mode and replaces the sender.
   */
  async switchCamera(facingMode: "user" | "environment"): Promise<MediaStream> {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: false,
    });
    const [newTrack] = newStream.getVideoTracks();
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender && newTrack) await sender.replaceTrack(newTrack);

    // Stop the old video track
    this.localStream?.getVideoTracks().forEach((t) => t.stop());
    return newStream;
  }

  /** Get current RTCPeerConnection stats (bandwidth, jitter, packet loss, etc.) */
  async getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  /** Current connection state */
  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  /** The raw RTCPeerConnection (for advanced use) */
  get native(): RTCPeerConnection {
    return this.pc;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  /** Stop all tracks and close the peer connection */
  destroy(): void {
    this.pc.getSenders().forEach((s) => {
      try { s.track?.stop(); } catch {}
    });
    this.pc.close();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.pendingIceCandidates = [];
    this.pendingOffer = null;
    this.remoteDescriptionSet = false;
    this.mediaReady = false;
  }
}
