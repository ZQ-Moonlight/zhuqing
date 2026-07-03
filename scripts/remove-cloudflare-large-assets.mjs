import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cloudflareExcludedAssets = [
  "dist/media/portfolio/ue-cinematics-pipeline/images/animated/motion-matching-scan-test.gif",
];

await Promise.all(
  cloudflareExcludedAssets.map(async (relativePath) => {
    const target = path.resolve(root, relativePath);
    await rm(target, { force: true });
    console.log(`Removed Cloudflare-external asset: ${relativePath}`);
  }),
);
