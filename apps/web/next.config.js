/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
