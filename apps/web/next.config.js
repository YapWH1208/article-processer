/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: [],
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
