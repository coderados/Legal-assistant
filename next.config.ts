import type { NextConfig } from "next";

// Note: do NOT use `output: "standalone"` here. This app depends on the
// better-sqlite3 native module, and standalone tracing does not reliably
// bundle its .node binding, which caused a runtime segfault on Render.
// A normal `next start` loads node_modules directly, so the native binary works.
const nextConfig: NextConfig = {
  // Keep native/server-only packages external so they aren't bundled by
  // Turbopack/webpack in a way that breaks their native bindings.
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
};

export default nextConfig;
