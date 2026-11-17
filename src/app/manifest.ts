import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlowGuard Plumbing Enterprises",
    short_name: "Flow Guard Plumbing",
    description: "Coordinated Plumbing Services, Job Tracking & Management Portal",
    start_url: "/",
    display: "standalone",
    background_color: "#07152B",
    theme_color: "#0B1F3A",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
