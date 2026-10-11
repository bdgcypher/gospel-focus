import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the statically exported Next.js app (see next.config.ts ->
 * output: "export") into native iOS and Android shells. The native projects are
 * generated on demand with:
 *
 *   npm run cap:add:ios
 *   npm run cap:add:android
 *
 * and kept in sync with the web build via `npm run cap:sync`.
 */
const config: CapacitorConfig = {
  appId: "app.opentoinspiration.app",
  appName: "Open to Inspiration",
  webDir: "out",
  backgroundColor: "#f7f2e7",
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#f7f2e7",
  },
  plugins: {
    // Edge-to-edge on Android 15+: the SystemBars plugin passes the real
    // status/navigation bar insets through to the WebView as
    // env(safe-area-inset-*), which the app's CSS uses for padding.
    // (Older WebViews get the WebView embedded below the bars instead.)
    SystemBars: {
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
