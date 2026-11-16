import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1360, 1920],
  },
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.binplumbing.com.ng" }],
        destination: "https://binplumbing.com.ng/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "binplumbing.com" }],
        destination: "https://binplumbing.com.ng/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.binplumbing.com" }],
        destination: "https://binplumbing.com.ng/:path*",
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
