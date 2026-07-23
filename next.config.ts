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
            //
            // The catalogue itself no longer routes through the optimiser --
            // see shared/ui/exercise-image.tsx -- but the pattern stays: it is
            // also what programme cover art is served from.
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/exercise-images/**",
          },
        ]
      : [],
    // Vercel bills a transformation per unique (url, width, quality). One
    // quality keeps that from multiplying, and Next 16 requires the allowlist
    // anyway.
    qualities: [75],
    // Only the widths programme covers actually render at (640 and 960, each
    // doubled for retina). The stock lists are eight device sizes plus seven
    // image sizes, and every extra entry is a variant we would pay for and
    // never serve.
    deviceSizes: [640, 960, 1280, 1920],
    imageSizes: [],
    // 31 days. The default is four hours, which re-bills every cached variant
    // six times a day for images that never change. Safe to keep this long
    // because covers are replaced by uploading to a new path, not in place.
    minimumCacheTTL: 2678400,
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
