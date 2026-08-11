import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chatapp.mobile",
  appName: "ChatApp",
  // Points at the Vite SPA build output for the native shell
  webDir: "dist",
  // When running `npx cap run ios/android`, load from the live dev server
  // instead of bundled files so you get hot-reload during development.
  // Comment this out for a production build.
  server: {
    // Replace with your actual Replit dev URL or backend URL for device testing
    url: process.env.VITE_DEV_URL ?? undefined,
    cleartext: true,
    androidScheme: "https",
  },
  plugins: {
    // Push notifications (Expo FCM handled by the backend; this is for native)
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    // Use localStorage for Clerk session persistence on native
    // (Capacitor bridges localStorage to native storage automatically)
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0f172a",
      showSpinner: false,
    },
    // Allow camera access for avatar/moment uploads
    Camera: {
      permissions: ["camera", "photos"],
    },
  },
  // iOS specific config
  ios: {
    contentInset: "automatic",
  },
  // Android specific config
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
