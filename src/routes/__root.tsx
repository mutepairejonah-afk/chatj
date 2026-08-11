import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/tanstack-start";
import appCss from "../styles.css?url";
import { MobileLayout } from "../components/MobileLayout";
import { useEffect } from "react";
import { initTheme } from "@/hooks/useTheme";



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

function RootComponent() {
  useEffect(() => {
    initTheme();
  }, []);

  const clerkKey = parseEnvKey(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string);

  return (
    <ClerkProvider publishableKey={clerkKey}>
      <MobileLayout>
        <Outlet />
      </MobileLayout>
    </ClerkProvider>
  );
}
