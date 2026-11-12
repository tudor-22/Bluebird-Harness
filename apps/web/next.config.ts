import path from "node:path";

import type { NextConfig } from "next";

// The desktop app ships the web page as a self-contained server.
const standalone = process.env.BLUEBIRD_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" as const, outputFileTracingRoot: path.join(__dirname, "../..") } : {}),
  transpilePackages: ["@bluebird/shared"],
  // The request guard buffers each API body so routes can still read it: room for a 10 MB file plus the form around it.
  experimental: { proxyClientMaxBodySize: "16mb" },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  // There is no landing page or sign-in: the app opens straight into the chat.
  async redirects() {
    return [{ source: "/", destination: "/chat", permanent: false }];
  },
  // A second dev server can run beside the main one with its own build dir.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
