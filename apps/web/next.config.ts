import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@reya/shared"],
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
