import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign In — ChatApp" },
      { name: "description", content: "Sign in to ChatApp" },
    ],
  }),
});

type View =
  | "sign_in"
  | "forgot_email"
  | "forgot_code"
  | "forgot_new_password"
  | "success";

function LoginPage() {
  const { isSignedIn } = useAuth();
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();

  // ── form state ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<View>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    if (isSignedIn) navigate({ to: "/" });
  }, [isSignedIn, navigate]);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const clearError = () => setError("");

  function clerkMessage(e: any): string {
    return (
      e?.errors?.[0]?.longMessage ||
      e?.errors?.[0]?.message ||
      e?.message ||
      "Something went wrong. Please try again."
    );
  }

  // ── email + password sign-in ─────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    clearError();
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        navigate({ to: "/" });
      } else {
        setError("Additional verification required. Please try again.");
      }
    } catch (err: any) {
      setError(clerkMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────
  async function handleGoogle() {
    if (!isLoaded || !signIn) return;
    clearError();
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/login`,
        redirectUrlComplete: `${window.location.origin}/`,
      });
    } catch (err: any) {
      setError(clerkMessage(err));
    }
  }

  // ── forgot password — step 1: send code to email ─────────────────────────
  async function handleForgotSend(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    clearError();
    setLoading(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setView("forgot_code");
    } catch (err: any) {
      setError(clerkMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // ── forgot password — step 2: verify code ────────────────────────────────
  async function handleForgotVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    clearError();
    if (resetCode.trim().length < 6) {
      setError("Please enter the 6-digit code sent to your email.");
      return;
    }
    setView("forgot_new_password");
  }

  // ── forgot password — step 3: set new password ───────────────────────────
  async function handleForgotSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    clearError();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode.trim(),
        password: newPassword,
      } as any);
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        setView("success");
        setTimeout(() => navigate({ to: "/" }), 1500);
      } else {
        setError("Could not reset password. Please check the code and try again.");
      }
    } catch (err: any) {
      setError(clerkMessage(err));
      // If the code itself was wrong, go back to code entry
      if (err?.errors?.[0]?.code === "form_code_incorrect") {
        setView("forgot_code");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── shared input class ───────────────────────────────────────────────────
  const inputClass =
    "w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

  // ── slide animation ──────────────────────────────────────────────────────
  const slideIn = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.2, ease: "easeOut" },
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col items-center gap-3"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
          <MessageCircle size={30} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">ChatApp</h1>
        <p className="text-sm text-muted-foreground">
          {view === "sign_in" && "Sign in to start messaging"}
          {view === "forgot_email" && "Reset your password"}
          {view === "forgot_code" && "Check your email"}
          {view === "forgot_new_password" && "Create a new password"}
          {view === "success" && "Password updated!"}
        </p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl shadow-black/10"
      >
        <div className="p-6">
          <AnimatePresence mode="wait" initial={false}>

            {/* ── SIGN IN ──────────────────────────────────────────────── */}
            {view === "sign_in" && (
              <motion.div key="sign_in" {...slideIn}>
                {/* Google OAuth */}
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-secondary py-3 text-sm font-medium text-foreground transition hover:bg-secondary/70 active:scale-[0.98]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                {/* Divider */}
                <div className="relative mb-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or sign in with email</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Email + password form */}
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Email address</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearError(); }}
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Password</label>
                      <button
                        type="button"
                        onClick={() => { setView("forgot_email"); clearError(); }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearError(); }}
                        className={`${inputClass} pl-10 pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember me — always on (Telegram style) */}
                  <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5">
                    <ShieldCheck size={16} className="shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">Stay signed in</p>
                      <p className="text-[11px] text-muted-foreground">
                        You'll stay logged in on this device — no repeated sign-ins, just like Telegram.
                      </p>
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60 active:scale-[0.98]"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {loading ? "Signing in…" : "Sign in"}
                  </button>
                </form>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Don't have an account?{" "}
                  <a href="/login#/sign-up" className="font-medium text-primary hover:underline">
                    Create one
                  </a>
                </p>
              </motion.div>
            )}

            {/* ── FORGOT — enter email ─────────────────────────────────── */}
            {view === "forgot_email" && (
              <motion.div key="forgot_email" {...slideIn}>
                <button
                  type="button"
                  onClick={() => { setView("sign_in"); clearError(); }}
                  className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft size={13} /> Back to sign in
                </button>

                <div className="mb-5 rounded-xl bg-secondary/60 p-4">
                  <p className="text-sm text-foreground">
                    Enter your email and we'll send you a verification code to reset your password.
                  </p>
                </div>

                <form onSubmit={handleForgotSend} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Email address</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        autoFocus
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearError(); }}
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {loading ? "Sending code…" : "Send reset code"}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ── FORGOT — enter code ──────────────────────────────────── */}
            {view === "forgot_code" && (
              <motion.div key="forgot_code" {...slideIn}>
                <button
                  type="button"
                  onClick={() => { setView("forgot_email"); clearError(); }}
                  className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft size={13} /> Back
                </button>

                <div className="mb-5 rounded-xl bg-secondary/60 p-4">
                  <p className="text-sm text-foreground">
                    We sent a 6-digit code to <span className="font-semibold">{email}</span>.
                    Enter it below.
                  </p>
                </div>

                <form onSubmit={handleForgotVerifyCode} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Verification code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      required
                      placeholder="123456"
                      value={resetCode}
                      onChange={(e) => { setResetCode(e.target.value.replace(/\D/g, "")); clearError(); }}
                      className={`${inputClass} text-center text-lg tracking-[0.4em] font-mono`}
                    />
                  </div>

                  {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={resetCode.length < 6}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    Continue
                  </button>

                  <button
                    type="button"
                    onClick={() => { setView("forgot_email"); clearError(); }}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Didn't receive it? Resend
                  </button>
                </form>
              </motion.div>
            )}

            {/* ── FORGOT — set new password ────────────────────────────── */}
            {view === "forgot_new_password" && (
              <motion.div key="forgot_new_password" {...slideIn}>
                <button
                  type="button"
                  onClick={() => { setView("forgot_code"); clearError(); }}
                  className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft size={13} /> Back
                </button>

                <div className="mb-5 rounded-xl bg-secondary/60 p-4">
                  <p className="text-sm text-foreground">Choose a new password for your account.</p>
                </div>

                <form onSubmit={handleForgotSetPassword} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">New password</label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showNewPassword ? "text" : "password"}
                        autoComplete="new-password"
                        autoFocus
                        required
                        minLength={8}
                        placeholder="At least 8 characters"
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); clearError(); }}
                        className={`${inputClass} pl-10 pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Password strength hint */}
                  {newPassword.length > 0 && (
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((n) => (
                        <div
                          key={n}
                          className={`h-1 flex-1 rounded-full transition-all ${
                            newPassword.length >= n * 3
                              ? newPassword.length >= 12
                                ? "bg-green-500"
                                : newPassword.length >= 8
                                ? "bg-yellow-400"
                                : "bg-red-400"
                              : "bg-border"
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || newPassword.length < 8}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {loading ? "Saving…" : "Set new password"}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ── SUCCESS ──────────────────────────────────────────────── */}
            {view === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-6 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
                  <CheckCircle2 size={36} className="text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Password updated!</p>
                  <p className="mt-1 text-sm text-muted-foreground">Signing you in…</p>
                </div>
                <Loader2 size={20} className="animate-spin text-primary" />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>

      {/* Footer note */}
      {view === "sign_in" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-center text-[11px] text-muted-foreground"
        >
          Your session is securely remembered on this device.
          <br />
          Sign out manually whenever you want to switch accounts.
        </motion.p>
      )}
    </div>
  );
}
