import type { NextConfig } from "next";

// Derived from the project URL rather than hardcoded, so a different Supabase
// project (a branch, a staging env) needs no code change.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            // Exercise images, served from our own Storage bucket.
            // They were briefly hotlinked from raw.githubusercontent.com;
            // scripts/upload-exercise-images.mts moved them here.
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/exercise-images/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Never let a CDN or browser cache a stale service worker -- clients
        // must see updates on their very next visit.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
