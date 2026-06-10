import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: "/socket.io/:path*",
        destination: "http://localhost:3003/socket.io/:path*",
      },
    ];
  },
};

export default nextConfig;
