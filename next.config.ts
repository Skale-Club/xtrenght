import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Exercise demonstration stills from free-exercise-db.
        //
        // Hotlinking a third party: acceptable for development, not for
        // production -- GitHub rate-limits raw content and gives no uptime
        // guarantee for it. Rehost to Supabase Storage before launch and this
        // entry goes away along with the image_urls values that point here.
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/yuhonas/free-exercise-db/**",
      },
    ],
  },
};

export default nextConfig;
