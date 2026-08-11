const KEY_ENABLED = "chatapp_lock_enabled";
const KEY_PIN_HASH = "chatapp_lock_pin_hash";
const KEY_BIOMETRIC = "chatapp_lock_biometric";
const KEY_CREDENTIAL_ID = "chatapp_lock_cred_id";
const LOCK_TIMEOUT_MS = 60_000; // 1 minute in background → lock

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function isAppLockEnabled(): boolean {
  return localStorage.getItem(KEY_ENABLED) === "true";
}

export function enableAppLock(enabled: boolean) {
  localStorage.setItem(KEY_ENABLED, enabled ? "true" : "false");
}

export function isBiometricPreferred(): boolean {
  return localStorage.getItem(KEY_BIOMETRIC) === "true";
}

export function setBiometricPreferred(v: boolean) {
  localStorage.setItem(KEY_BIOMETRIC, v ? "true" : "false");
}

export function hasPinSet(): boolean {
  return !!localStorage.getItem(KEY_PIN_HASH);
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function setPin(pin: string): Promise<void> {
  const hash = await sha256(pin);
  localStorage.setItem(KEY_PIN_HASH, hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY_PIN_HASH);
  if (!stored) return false;
  const hash = await sha256(pin);
  return hash === stored;
}

export function clearLockData() {
  localStorage.removeItem(KEY_ENABLED);
  localStorage.removeItem(KEY_PIN_HASH);
  localStorage.removeItem(KEY_BIOMETRIC);
  localStorage.removeItem(KEY_CREDENTIAL_ID);
}

// ─── WebAuthn biometric helpers ───────────────────────────────────────────────

export function isBiometricSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** Try to detect platform authenticator (Touch ID / Face ID / Windows Hello) */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  try {
    return await (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometric(userId: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "ChatApp", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: userId,
          displayName: "ChatApp User",
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;

    const id = btoa(
      String.fromCharCode(...new Uint8Array(credential.rawId))
    );
    localStorage.setItem(KEY_CREDENTIAL_ID, id);
    setBiometricPreferred(true);
    return true;
  } catch (err) {
    console.error("Biometric registration failed:", err);
    return false;
  }
}

export async function authenticateWithBiometric(): Promise<boolean> {
  const storedId = localStorage.getItem(KEY_CREDENTIAL_ID);
  if (!storedId) return false;
  try {
    const rawId = Uint8Array.from(atob(storedId), (c) => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [{ type: "public-key", id: rawId }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (err) {
    console.error("Biometric auth failed:", err);
    return false;
  }
}

// ─── Background timer ─────────────────────────────────────────────────────────

let hiddenAt: number | null = null;

export function startLockTimer(onLock: () => void) {
  const handleVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else {
      if (hiddenAt !== null && Date.now() - hiddenAt >= LOCK_TIMEOUT_MS) {
        if (isAppLockEnabled()) onLock();
      }
      hiddenAt = null;
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility);
}
