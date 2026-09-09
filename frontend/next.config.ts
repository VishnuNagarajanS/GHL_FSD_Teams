import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Allow any external dev tunnel (ngrok, localtunnel, etc.) to access dev resources
  allowedDevOrigins: [
    '*.ngrok-free.dev',
    '*.ngrok.io',
    '*.ngrok.app',
    '*.loca.lt',
    '*.tunnel.dev',
  ],

  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      // Proxy all REST API calls to the backend
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      // Proxy Socket.IO traffic through Next.js (both with and without subpaths)
      {
        source: '/socket.io',
        destination: `${BACKEND_URL}/socket.io/`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${BACKEND_URL}/socket.io/:path*`,
      },
      // Proxy uploaded files
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
};

export default nextConfig;
