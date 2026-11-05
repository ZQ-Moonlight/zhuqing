import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localDir = path.join(root, ".private-study");
const settingsPath = path.join(localDir, "settings.json");
const configPath = path.join(root, "src", "data", "study-vault.json");
let previousConfig;
try { previousConfig = JSON.parse(await readFile(configPath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const sourceFlag = process.argv.indexOf("--source");
await mkdir(localDir, { recursive: true });
let settings;
try {
    settings = JSON.parse(await readFile(settingsPath, "utf8"));
} catch (error) {
    if (error.code !== "ENOENT") throw error;
    settings = { password: randomBytes(18).toString("base64url") };
}
if (sourceFlag !== -1) settings.source = process.argv[sourceFlag + 1];
if (!settings.source) throw new Error("Supply --source with the local study folder.");
const source = path.resolve(settings.source);
if (!(await stat(source)).isDirectory()) throw new Error("Study source must be a directory.");
await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");

const groups = [
    ["animation-vfx", "S18专业设计图文摘录_v3_动画与特效深入_2026-10-26", "S18动画与特效_图文对照阅读版_v3.html"],
    ["production", "游戏研发个人知识库", "00_总览与学习地图.md"],
    ["level-ui", "关卡与UI实际设计案例_2026-10-26", "01_关卡设计方法与实际案例.txt"],
    ["design-practice", "S18专业设计与执行细节_2026-10-26", "01_专业设计与执行细节学习文稿.txt"],
    ["indie", "独立游戏与团队创业研究_2026-10-26", "01_帮助程度与能力缺口.txt"],
];
const mimeTypes = {
    ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
    ".gif": "image/gif", ".mp4": "video/mp4",
};
const escapeHtml = (value) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const salt = randomBytes(32);
const iterations = 600000;
const key = pbkdf2Sync(settings.password, salt, iterations, 32, "sha256");
const buildId = randomBytes(12).toString("hex");
const destination = path.join(root, "public", "media", "study-vault", buildId);
const chunkSize = 8 * 1024 * 1024;
await mkdir(destination, { recursive: true });

async function encrypt(bytes) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const encrypted = Buffer.concat([iv, body, cipher.getAuthTag()]);
    // Verify every generated payload before publishing its opaque filename.
    const check = createDecipheriv("aes-256-gcm", key, iv);
    check.setAuthTag(encrypted.subarray(-16));
    const decoded = Buffer.concat([check.update(encrypted.subarray(12, -16)), check.final()]);
    if (!decoded.equals(bytes)) throw new Error("Encryption round-trip failed.");
    const name = createHash("sha256").update(encrypted).digest("hex") + ".bin";
    await writeFile(path.join(destination, name), encrypted);
    return name;
}

async function packageFile(bytes, mime) {
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const part = bytes.subarray(offset, offset + chunkSize);
        chunks.push({ name: await encrypt(part), size: part.length });
    }
    return { size: bytes.length, mime, chunks };
}

async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await walk(full));
        else if (entry.isFile()) files.push(full);
    }
    return files;
}

const markdown = await createMarkdownProcessor();
function textToMarkdown(text, title) {
    const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
    if (lines[0]?.trim() === title) lines.shift();
    return `# ${escapeHtml(title)}\n\n` + lines.map((line) => {
        const safe = escapeHtml(line);
        if (/^[一二三四五六七八九十]+[、．.]/.test(line) && line.length < 75) return `## ${safe}`;
        if (/^[（(][一二三四五六七八九十\d]+[）)]/.test(line) && line.length < 75) return `### ${safe}`;
        if (/^https?:\/\/\S+$/.test(line)) return `<${safe}>`;
        return safe;
    }).join("\n\n");
}

const manifest = { version: 1, files: {}, topics: {}, originalCount: 0 };
const files = await walk(source);
for (const fullPath of files) {
    const relative = path.relative(source, fullPath).split(path.sep).join("/");
    const extension = path.extname(fullPath).toLowerCase();
    const bytes = await readFile(fullPath);
    const entry = await packageFile(bytes, mimeTypes[extension] ?? "application/octet-stream");
    entry.sha256 = createHash("sha256").update(bytes).digest("hex");
    if ([".md", ".txt"].includes(extension)) {
        const original = bytes.toString("utf8").replace(/^\uFEFF/, "");
        const fileTitle = path.basename(fullPath, extension).replace(/^\d+_/, "").replace(/_/g, " ");
        const rendered = await markdown.render(extension === ".txt" ? textToMarkdown(original, fileTitle) : original);
        const title = rendered.metadata.headings.find((h) => h.depth === 1)?.text ?? path.basename(fullPath, extension);
        const toc = rendered.metadata.headings.filter((h) => h.depth === 2);
        const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body class="study-prose"><div class="prose-grid"><nav class="prose-toc" aria-label="文章目录"><strong>本篇目录</strong>${toc.map((h) => `<a href="#${escapeHtml(h.slug)}">${escapeHtml(h.text)}</a>`).join("")}</nav><article>${rendered.code}</article></div></body></html>`;
        entry.view = await packageFile(Buffer.from(html), "text/html; charset=utf-8");
        entry.title = title;
    }
    if (extension === ".html") {
        entry.title = bytes.toString("utf8").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    }
    manifest.files[relative] = entry;
    manifest.originalCount++;
}

for (const [slug, folder, first] of groups) {
    const documents = Object.entries(manifest.files)
        .filter(([name]) => name.startsWith(folder + "/") && /\.(md|txt|html)$/.test(name))
        .map(([name, file]) => ({
            path: name,
            title: file.title ?? path.posix.basename(name).replace(/\.(md|txt|html)$/, "").replace(/^\d+_/, "").replace(/_/g, " "),
            folder: path.posix.dirname(name).slice(folder.length + 1).replaceAll("_", " "),
            format: path.posix.extname(name).slice(1).toUpperCase(),
        }));
    const firstPath = folder + "/" + first;
    documents.sort((a, b) => Number(b.path === firstPath) - Number(a.path === firstPath) || a.path.localeCompare(b.path, "zh-CN"));
    manifest.topics[slug] = { first: firstPath, documents };
}

const index = await encrypt(Buffer.from(JSON.stringify(manifest)));
const publicConfig = { version: 1, buildId, salt: salt.toString("base64"), iterations, index, assetRoot: `media/study-vault/${buildId}/` };
await mkdir(path.join(root, "src", "data"), { recursive: true });
await writeFile(configPath + ".tmp", JSON.stringify(publicConfig, null, 2) + "\n");
await rename(configPath + ".tmp", configPath);

const publicDirectory = path.join(root, "public", "blog", "study");
await mkdir(publicDirectory, { recursive: true });
let publicHtml = await readFile(path.join(source, "FPS_TPS关卡设计学习资料.html"), "utf8");
publicHtml = publicHtml.replace(/<\/head>/i, '<link rel="stylesheet" href="./frame.css"><script defer src="./frame.js"></script></head>');
await writeFile(path.join(publicDirectory, "fps-tps-source.html"), publicHtml);
await writeFile(path.join(localDir, "访问说明.txt"), `学习资料库\n\n资料密码：${settings.password}\n\n本地预览：http://127.0.0.1:4321/blog/study/\n网站入口：https://zhuqing.tech/blog/study/\n\n此文件只保存在本地 .private-study 目录。\n原始资料：${source}\n\n更新资料后运行 node scripts/prepare-study-library.mjs，再构建网站。\n重新生成时会沿用本地 settings.json 中的密码。更换密码需重新加密全部资料。\n`);
console.log(`Packaged and round-trip verified ${manifest.originalCount} original files. ${Object.keys(manifest.topics).length} protected topics.`);
console.log(`Encrypted payloads: public/media/study-vault/${buildId}`);
console.log("Password and source location: .private-study/访问说明.txt (ignored by Git)");
if (previousConfig && /^[a-f0-9]{24}$/.test(previousConfig.buildId) && previousConfig.buildId !== buildId) {
    const vaultRoot = await realpath(path.join(root, "public", "media", "study-vault"));
    const obsolete = path.join(vaultRoot, previousConfig.buildId);
    const resolved = await realpath(obsolete);
    if (resolved !== obsolete || path.dirname(resolved) !== vaultRoot) throw new Error("Unexpected old payload location.");
    await rm(resolved, { recursive: true });
}
