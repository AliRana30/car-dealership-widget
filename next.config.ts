import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['nodemailer'],
  async rewrites() {
    return [
      {
        source: '/api/widget',
        destination: '/api/widgets',
      },
      {
        source: '/api/widget/:path*',
        destination: '/api/widgets/:path*',
      },
    ];
  },
};

export default nextConfig;
