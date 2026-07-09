import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const contentRoot = path.join(root, "src", "content", "blog");
const maxBytes = Number(process.env.PUBLIC_PDF_MAX_BYTES ?? 25 * 1024 * 1024);

const toPosix = (value) => value.split(path.sep).join("/");

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return [fullPath];
    }),
  );
  return files.flat();
};

const hashFile = (fullPath, hash = createHash("sha256")) =>
  new Promise((resolve, reject) => {
    createReadStream(fullPath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

const hashChunkSet = async (chunkDir, parts) => {
  const hash = createHash("sha256");
  for (const part of parts) {
    const partPath = path.join(chunkDir, part);
    const bytes = await readFile(partPath);
    hash.update(bytes);
  }
  return hash.digest("hex");
};

const distFiles = await walk(distRoot);
const oversizeFiles = [];

for (const file of distFiles) {
  const fileStat = await stat(file);
  if (fileStat.size > maxBytes) {
    oversizeFiles.push({ path: toPosix(path.relative(root, file)), size: fileStat.size });
  }
}

if (oversizeFiles.length > 0) {
  console.error(`Found ${oversizeFiles.length} file(s) over ${(maxBytes / 1024 / 1024).toFixed(1)} MB:`);
  for (const file of oversizeFiles) {
    console.error(`- ${file.path} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  }
  process.exit(1);
}

const manifestFiles = distFiles.filter((file) => toPosix(path.relative(distRoot, file)).startsWith("blog/file-chunks/") && path.basename(file) === "manifest.json");

for (const manifestPath of manifestFiles) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const chunkDir = path.dirname(manifestPath);
  const relativePdf = toPosix(path.relative(path.join(distRoot, "blog", "file-chunks"), chunkDir));
  const sourcePath = path.join(contentRoot, ...relativePdf.split("/"));
  const sourceHash = await hashFile(sourcePath);
  const chunkHash = await hashChunkSet(chunkDir, manifest.parts);

  if (sourceHash !== chunkHash) {
    console.error(`Chunk hash mismatch: ${relativePdf}`);
    console.error(`source: ${sourceHash}`);
    console.error(`chunks: ${chunkHash}`);
    process.exit(1);
  }

  console.log(`Verified chunked PDF: ${relativePdf} (${manifest.parts.length} parts)`);
}

console.log("Cloudflare PDF download verification passed.");
