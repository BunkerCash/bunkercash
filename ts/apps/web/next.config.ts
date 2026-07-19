import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

initOpenNextCloudflareForDev({
  configPath: path.join(currentDir, "wrangler.dev.jsonc"),
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@bunkercash/cloudflare-kv",
    "@bunkercash/metrics-data",
    "@bunkercash/support-requests",
  ],
};

export default nextConfig;
