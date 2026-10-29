import { readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MAX_DEPLOY_BYTES } from "./deploy-limits.mjs";
import { getPdfSources } from "./pdf-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

// Keep the original release in public intact. Only change its transport in dist.
const gamePath = path.join(dist, "play/puguang/index.html");
let html = await readFile(gamePath, "utf8");
const pack = /(<script\b[^>]*\bid="pack"[^>]*>)([A-Za-z0-9+/=\s]+)(<\/script>)/;
const match = html.match(pack);
if (!match) throw new Error("Puguang v1.0.4 embedded pack was not found");
const encoded = match[2].trim();
const payload = Buffer.from(encoded, "base64");
if (payload.toString("base64") !== encoded) throw new Error("Non-canonical game payload");
if (payload.length > MAX_DEPLOY_BYTES) throw new Error("Game payload exceeds hosting limit");
const sha = createHash("sha256").update(payload).digest("hex");
const payloadName = `pack-${sha.slice(0, 16)}.bin`;
await writeFile(path.join(path.dirname(gamePath), payloadName), payload);
const originalRead = 'r(document.getElementById("pack").textContent.trim())';
if (!html.includes(originalRead)) throw new Error("Puguang release loader changed");
// Fetch the exact encrypted bytes; decryption, assets, and gameplay stay unchanged.
html = html.replace(pack, "").replace(originalRead,
  `await(async()=>{const response=await fetch(new URL(${JSON.stringify(payloadName)},location.href));if(!response.ok)throw Error("游戏素材载入失败，请刷新重试。");return new Uint8Array(await response.arrayBuffer())})()`);
await writeFile(gamePath, html);
console.log(`Puguang payload: ${payload.length} bytes, SHA-256 ${sha}`);

// These original GIFs now have smaller, same-duration H.264 loop replacements.
for (const name of ["motion-matching-scan-test", "early-scan-development", "scan-state-comparison", "raindrop-puddle-fx"]) {
  await rm(path.join(dist, `media/portfolio/ue-cinematics-pipeline/images/animated/${name}.gif`), { force: true });
}
// Large public PDFs use the same lossless chunk download as blog PDFs.
for (const source of await getPdfSources()) {
  if (source.relativePath.startsWith("_public/")) {
    await rm(path.join(dist, source.relativePath.slice("_public/".length)), { force: true });
  }
}

let largest = { name: "", size: 0 };
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await check(fullPath);
    else {
      const { size } = await stat(fullPath);
      if (size > MAX_DEPLOY_BYTES) throw new Error(`Deploy asset exceeds 20 MB: ${path.relative(dist, fullPath)} (${size} bytes)`);
      if (size > largest.size) largest = { name: path.relative(dist, fullPath), size };
    }
  }
}
await check(dist);
console.log(`Deploy size check passed; largest file: ${largest.name} (${largest.size} bytes)`);
