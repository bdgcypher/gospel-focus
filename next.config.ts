import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the same build can be dropped into Capacitor for
  // iOS/Android (see capacitor.config.ts) or served as a plain static site.
  output: "export",
  // Allow the cloud preview hostname to reach the dev server.
  //
  // This machine by its own address counts as a foreign origin here: next dev
  // trusts the hostname it was asked for, so a tab opened at 127.0.0.1:3000 (or
  // localhost:3000) is refused its dev resources — the HMR socket comes back
  // 403 and Next logs it as a blocked cross-origin request on every page. Both
  // spellings are listed so the local preview works; anything else is still
  // blocked, and this config is dev-only either way.
  allowedDevOrigins: [
    "pv-3d762503ec8b-affcc3c4-c57f-4458-b4e6-675150830190.style.dev",
    "127.0.0.1",
    "localhost",
  ],
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  devIndicators: false,
};

export default nextConfig;
