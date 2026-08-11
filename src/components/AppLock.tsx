import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fingerprint, Delete, Lock } from "lucide-react";
import {
  verifyPin,
  hasPinSet,
  isBiometricPreferred,
  isBiometricSupported,
  authenticateWithBiometric,
} from "@/lib/appLock";

interface AppLockScreenProps {
  onUnlocked: () => void;
}

export function AppLockScreen({ onUnlocked }: AppLockScreenProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  // Prevents double-fire on mobile where onPointerDown fires for both
  // touch and synthetic mouse events, adding two digits from one tap.
  const processingRef = useRef(false);
  const PIN_LENGTH = 6;

  useEffect(() => {
    setBiometricAvailable(isBiometricSupported() && isBiometricPreferred());
  }, []);

  const tryBiometric = useCallback(async () => {
    setBiometricLoading(true);
    try {
      const ok = await authenticateWithBiometric();
      if (ok) onUnlocked();
    } catch (err) {
      console.warn("Biometric auth failed:", err);
    }
    setBiometricLoading(false);
  }, [onUnlocked]);

  // Auto-prompt biometric on mount
  useEffect(() => {
    if (biometricAvailable) tryBiometric();
  }, [biometricAvailable, tryBiometric]);

  const pressDigit = async (d: string) => {
    if (processingRef.current) return;
    setDigits((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = [...prev, d];
      if (next.length === PIN_LENGTH) {
        processingRef.current = true;
        verifyPin(next.join("")).then((ok) => {
          processingRef.current = false;
          if (ok) {
            onUnlocked();
          } else {
            setShake(true);
            setTimeout(() => {
              setDigits([]);
              setShake(false);
            }, 600);
          }
        });
      }
      return next;
    });
  };

  const backspace = () => {
    if (processingRef.current) return;
    setDigits((prev) => prev.slice(0, -1));
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-background px-8"
    >
      <Lock size={36} className="mb-6 text-primary" />
      <p className="mb-2 text-xl font-bold text-foreground">App Locked</p>
      <p className="mb-10 text-sm text-muted-foreground">Enter your PIN to continue</p>

      {/* Dots */}
      <motion.div
        className="mb-10 flex gap-4"
        animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <motion.div
            key={i}
            animate={{ scale: digits[i] ? 1.2 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              digits[i]
                ? "border-primary bg-primary"
                : "border-muted-foreground/40 bg-transparent"
            }`}
          />
        ))}
      </motion.div>

      {/* Numpad */}
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {keys.map((k, i) => {
          if (k === "") return <div key={i} />;
          if (k === "⌫") {
            return (
              <button
                key={i}
                onClick={backspace}
                className="flex h-16 w-full items-center justify-center rounded-2xl bg-secondary text-foreground active:scale-95 transition-transform"
              >
                <Delete size={20} />
              </button>
            );
          }
          return (
            <button
              key={k}
              onClick={() => pressDigit(k)}
              className="flex h-16 w-full flex-col items-center justify-center rounded-2xl bg-card text-foreground shadow-sm active:scale-95 transition-transform"
            >
              <span className="text-2xl font-semibold leading-none">{k}</span>
            </button>
          );
        })}
      </div>

      {/* Biometric button */}
      <AnimatePresence>
        {biometricAvailable && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onPointerDown={tryBiometric}
            disabled={biometricLoading}
            className="mt-8 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-primary active:opacity-70 disabled:opacity-50"
          >
            <Fingerprint size={20} />
            {biometricLoading ? "Verifying…" : "Use Biometric"}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Setup flow: create a new PIN ─────────────────────────────────────────────
interface SetupPinProps {
  onDone: () => void;
  onCancel: () => void;
}

export function SetupPin({ onDone, onCancel }: SetupPinProps) {
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState<string[]>([]);
  const [second, setSecond] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const PIN_LENGTH = 6;

  const current = stage === "enter" ? first : second;
  const setCurrent = stage === "enter" ? setFirst : setSecond;

  // Ref prevents double-digit entry from touch + synthetic mouse events
  const processingSetupRef = useRef(false);

  const pressDigit = (d: string) => {
    if (processingSetupRef.current) return;
    const setter = stage === "enter" ? setFirst : setSecond;
    setter((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = [...prev, d];
      if (next.length === PIN_LENGTH) {
        processingSetupRef.current = true;
        (async () => {
          try {
            if (stage === "enter") {
              setStage("confirm");
            } else {
              if (next.join("") === first.join("")) {
                const { setPin, enableAppLock } = await import("@/lib/appLock");
                await setPin(next.join(""));
                enableAppLock(true);
                onDone();
              } else {
                setShake(true);
                setTimeout(() => {
                  setSecond([]);
                  setShake(false);
                }, 600);
              }
            }
          } finally {
            processingSetupRef.current = false;
          }
        })();
      }
      return next;
    });
  };

  const backspace = () => {
    if (processingSetupRef.current) return;
    const setter = stage === "enter" ? setFirst : setSecond;
    setter((prev) => prev.slice(0, -1));
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-background px-8"
    >
      <button onClick={onCancel} className="absolute left-4 top-[max(env(safe-area-inset-top),16px)] rounded-full p-2 text-muted-foreground">
        ✕
      </button>

      <Lock size={36} className="mb-6 text-primary" />
      <p className="mb-2 text-xl font-bold text-foreground">
        {stage === "enter" ? "Set PIN" : "Confirm PIN"}
      </p>
      <p className="mb-10 text-sm text-muted-foreground">
        {stage === "enter"
          ? "Choose a 6-digit PIN"
          : "Enter your PIN again to confirm"}
      </p>

      <motion.div
        className="mb-10 flex gap-4"
        animate={shake ? { x: [0, -10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <motion.div
            key={i}
            animate={{ scale: current[i] ? 1.2 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              current[i]
                ? "border-primary bg-primary"
                : "border-muted-foreground/40 bg-transparent"
            }`}
          />
        ))}
      </motion.div>

      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {keys.map((k, i) => {
          if (k === "") return <div key={i} />;
          if (k === "⌫") {
            return (
              <button
                key={i}
                onClick={backspace}
                className="flex h-16 w-full items-center justify-center rounded-2xl bg-secondary text-foreground active:scale-95 transition-transform"
              >
                <Delete size={20} />
              </button>
            );
          }
          return (
            <button
              key={k}
              onClick={() => pressDigit(k)}
              className="flex h-16 w-full flex-col items-center justify-center rounded-2xl bg-card text-foreground shadow-sm active:scale-95 transition-transform"
            >
              <span className="text-2xl font-semibold leading-none">{k}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
