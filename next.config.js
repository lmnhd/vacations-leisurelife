/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      "oaidalleapiprodscus.blob.core.windows.net",
      "www.vacationstogo.com",
      "assets.vacationstogo.com",
      "www.cruisebrothers.com",
    ],
  },
  experimental: {
    serverActions: true
  }
};

module.exports = nextConfig;
