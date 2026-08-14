/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // googleapis pulls in optional deps that Next tries to bundle; keep it external.
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'cheerio'],
  },
};

export default nextConfig;
