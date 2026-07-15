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
};

export default nextConfig;
