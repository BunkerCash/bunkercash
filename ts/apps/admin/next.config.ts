import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@bunkercash/cloudflare-kv",
    "@bunkercash/metrics-data",
    "@bunkercash/support-requests",
  ],
};

export default nextConfig;
