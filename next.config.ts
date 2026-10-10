import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the same build can be dropped into Capacitor for
  // iOS/Android (see capacitor.config.ts) or served as a plain static site.
  output: "export",
  // Allow the cloud preview hostname to reach the dev server.
  allowedDevOrigins: [
    "pv-3d762503ec8b-affcc3c4-c57f-4458-b4e6-675150830190.style.dev",
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
};

export default nextConfig;
