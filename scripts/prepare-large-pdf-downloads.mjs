import { mkdir, open, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(root, "src", "content", "blog");
const outputRoot = path.join(root, "dist", "blog", "file-chunks");
const maxPublicPdfBytes = Number(process.env.PUBLIC_PDF_MAX_BYTES ?? 25 * 1024 * 1024);
const chunkBytes = Number(process.env.PUBLIC_PDF_CHUNK_BYTES ?? 20 * 1024 * 1024);

const toPosix = (value) => value.split(path.sep).join("/");

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(fullPath);
        return [fullPath];
      }),
  );
  return files.flat();
};

await rm(outputRoot, { force: true, recursive: true });

const files = await walk(contentRoot);
const largePdfs = [];

for (const fullPath of files) {
  if (!fullPath.toLowerCase().endsWith(".pdf")) continue;

  const fileStat = await stat(fullPath);
  if (fileStat.size <= maxPublicPdfBytes) continue;

  largePdfs.push({
    fullPath,
    relativePath: toPosix(path.relative(contentRoot, fullPath)),
    size: fileStat.size,
  });
}

for (const file of largePdfs) {
  const outputDir = path.join(outputRoot, ...file.relativePath.split("/"));
  await mkdir(outputDir, { recursive: true });

  const parts = [];
  const source = await open(file.fullPath, "r");

  try {
    for (let offset = 0, index = 0; offset < file.size; index += 1) {
      const partSize = Math.min(chunkBytes, file.size - offset);
      const buffer = Buffer.allocUnsafe(partSize);
      const { bytesRead } = await source.read(buffer, 0, partSize, offset);
      const partName = `part-${String(index).padStart(3, "0")}.bin`;

      await writeFile(path.join(outputDir, partName), buffer.subarray(0, bytesRead));
      parts.push(partName);
      offset += bytesRead;
    }
  } finally {
    await source.close();
  }

  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        filename: path.basename(file.fullPath),
        sourceSize: file.size,
        chunkBytes,
        mimeType: "application/pdf",
        parts,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Prepared chunked PDF download: ${file.relativePath} (${parts.length} parts)`);
}
