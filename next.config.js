/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
  },
};

module.exports = nextConfig;
