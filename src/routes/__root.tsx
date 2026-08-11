import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import appCss from "../styles.css?url";
import { MobileLayout } from "../components/MobileLayout";
import { useEffect } from "react";
import { initTheme } from "@/hooks/useTheme";
import { MessageCircle } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
      { title: "ChatApp — Messenger" },
      { name: "description", content: "A modern mobile messaging app" },
      { name: "theme-color", content: "#1a1a2e" },
      { property: "og:title", content: "ChatApp — Messenger" },
      { property: "og:description", content: "A modern mobile messaging app" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

// Normalize the Clerk publishable key: if the secret was stored as a full
// "KEY=value" line (e.g. VITE_CLERK_PUBLISHABLE_KEY=pk_test_...) strip the
// variable-name prefix so Clerk receives only the bare value.
function parseEnvKey(raw: string | undefined): string {
  if (!raw) return "";
  const eq = raw.indexOf("=");
  return eq !== -1 ? raw.slice(eq + 1) : raw;
}

// ── Splash screen shown while Clerk initialises ───────────────────────────────
// Renders branded skeleton rows that look exactly like the chat list so the
// transition to real content feels seamless (no layout shift).
function SplashScreen() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Fake header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="h-7 w-20 rounded-lg bg-secondary animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-full bg-secondary animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-secondary animate-pulse" />
        </div>
      </div>

      {/* Fake search bar */}
      <div className="px-4 pb-3">
        <div className="h-10 w-full rounded-xl bg-secondary animate-pulse" />
      </div>

      {/* Fake chat rows */}
      <div className="flex-1 space-y-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div
              className="h-12 w-12 shrink-0 rounded-full bg-secondary animate-pulse"
              style={{ animationDelay: `${i * 40}ms` }}
            />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <div
                  className="h-4 rounded bg-secondary animate-pulse"
                  style={{ width: `${90 + (i % 3) * 30}px`, animationDelay: `${i * 40}ms` }}
                />
                <div
                  className="h-3 w-10 rounded bg-secondary animate-pulse"
                  style={{ animationDelay: `${i * 40 + 20}ms` }}
                />
              </div>
              <div
                className="h-3 rounded bg-secondary animate-pulse"
                style={{ width: `${120 + (i % 4) * 25}px`, animationDelay: `${i * 40 + 10}ms` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Centred logo (appears after a short delay so it's not jarring on fast loads) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-0 animate-[fadeIn_0.3s_0.4s_forwards]">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 shadow-xl ring-1 ring-primary/20">
          <MessageCircle size={38} className="text-primary" />
        </div>
        <p className="mt-4 text-lg font-bold text-foreground">ChatApp</p>
        <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

// Must be a direct child of <ClerkProvider> so it can call useAuth()
function AuthLoadGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useAuth();
  if (!isLoaded) return <SplashScreen />;
  return <>{children}</>;
}

function RootComponent() {
  useEffect(() => {
    initTheme();
  }, []);

  const clerkKey = parseEnvKey(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string);

  return (
    <ClerkProvider publishableKey={clerkKey}>
      <AuthLoadGuard>
        <MobileLayout>
          <Outlet />
        </MobileLayout>
      </AuthLoadGuard>
    </ClerkProvider>
  );
}
