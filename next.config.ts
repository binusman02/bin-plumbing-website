import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1360, 1920],
  },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/.well-known/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "application/json; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.flowguard.com.ng" }],
        destination: "https://flowguard.com.ng/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "flowguard.com.ng" }],
        destination: "https://flowguard.com.ng/:path*",
        permanent: true,
      },
      {
        source: "/guides",
        destination: "/en/blog",
        permanent: true,
      },
      {
        source: "/guides/:slug",
        destination: "/en/blog/:slug",
        permanent: true,
      },
      {
        source: "/projects",
        destination: "/gallery",
        permanent: true,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
