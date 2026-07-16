import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Xtrenght",
    short_name: "Xtrenght",
    description: "Track your training, build real strength.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08090b",
    theme_color: "#08090b",
    lang: "en",
    dir: "ltr",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/manifest-icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/manifest-icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/manifest-icons/maskable-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/manifest-icons/maskable-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard" },
      { name: "Programs", url: "/programs" },
      { name: "Exercises", url: "/exercises" },
    ],
  };
}
