import type { MetadataRoute } from "next";

/** Web app manifest — installable PWA (Chrome/Android install prompt, iOS Add to Home Screen via appleWebApp in layout). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rift — tactical manager",
    short_name: "Rift",
    description: "Build a squad, write its doctrine, watch it fight, read why it lost. Rematch.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0d0f14",
    theme_color: "#0d0f14",
    categories: ["games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
