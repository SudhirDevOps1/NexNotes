import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // v2.3.2 — baseline hardening for every response. No CSP yet: Next's
  // inline bootstrap needs a nonce pipeline; a broken CSP is worse than none.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // v2.3.2 — type errors are a build gate now. This used to be `true`, which
  // is exactly how silent drift survives into production bundles.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
