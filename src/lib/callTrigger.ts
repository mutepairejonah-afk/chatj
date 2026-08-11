/**
 * Global call trigger — lets any page start an outgoing call through
 * MobileLayout's call layer without a page navigation.
 */

type StartCallFn = (params: {
  conversationId: string;
  peerClerkId: string;
  peerName: string;
  peerAvatar: string | null;
  kind: "audio" | "video";
}) => void;

let _fn: StartCallFn | null = null;

export function registerCallStarter(fn: StartCallFn) {
  _fn = fn;
}

export function unregisterCallStarter() {
  _fn = null;
}

/** Returns true if a call layer is mounted and ready. */
export function canStartCall() {
  return _fn !== null;
}

/** Trigger an outgoing call from any page without a navigation. */
export function startGlobalCall(params: Parameters<StartCallFn>[0]) {
  if (_fn) {
    _fn(params);
  }
}
