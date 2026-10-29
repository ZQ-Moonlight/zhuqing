import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_PUBLIC_PDF_BYTES } from "./deploy-limits.mjs";

// Astro bundles this helper into dist/.prerender; use the build working directory.
const root = process.cwd();

export async function getPdfSources() {
  const result = [];
  async function walk(dir, sourceRoot, prefix) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath, sourceRoot, prefix);
      else if (entry.name.toLowerCase().endsWith(".pdf")) {
        const size = (await stat(fullPath)).size;
        if (size > MAX_PUBLIC_PDF_BYTES) result.push({
          fullPath,
          relativePath: prefix + path.relative(sourceRoot, fullPath).split(path.sep).join("/"),
          size,
        });
      }
    }
  }
  const blog = path.join(root, "src/content/blog");
  const publicRoot = path.join(root, "public");
  await walk(blog, blog, "");
  await walk(publicRoot, publicRoot, "_public/");
  return result;
}
