import "./src/env.js";
/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
export default config;
