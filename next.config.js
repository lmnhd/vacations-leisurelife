/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
  serverExternalPackages: ['ffmpeg-static', 'sharp'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oaidalleapiprodscus.blob.core.windows.net",
      },
      {
        protocol: "https",
        hostname: "www.vacationstogo.com",
      },
      {
        protocol: "https",
        hostname: "assets.vacationstogo.com",
      },
      {
        protocol: "https",
        hostname: "www.cruisebrothers.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "www.pexels.com",
      },
      {
        // Google Image Search results come from arbitrary domains
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

module.exports = nextConfig;
