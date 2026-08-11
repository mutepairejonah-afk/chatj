import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SignIn, useAuth } from "@clerk/tanstack-start";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign In — ChatApp" },
      { name: "description", content: "Sign in to ChatApp" },
    ],
  }),
});

function LoginPage() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn) {
      navigate({ to: "/" });
    }
  }, [isSignedIn, navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col items-center gap-3"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20">
          <MessageCircle size={32} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">ChatApp</h1>
        <p className="text-sm text-muted-foreground">Sign in to start messaging</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <SignIn
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full max-w-sm",
              card: "bg-surface border border-border rounded-2xl shadow-xl",
              headerTitle: "text-foreground",
              headerSubtitle: "text-muted-foreground",
              socialButtonsBlockButton: "bg-secondary border-border text-foreground hover:bg-secondary/80",
              formFieldLabel: "text-foreground",
              formFieldInput: "bg-secondary border-border text-foreground",
              formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground",
              footerActionLink: "text-primary hover:text-primary/80",
              dividerLine: "bg-border",
              dividerText: "text-muted-foreground",
            },
          }}
        />
      </motion.div>
    </div>
  );
}
