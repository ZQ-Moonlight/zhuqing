import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localDir = path.join(root, ".private-study");
const settingsPath = path.join(localDir, "settings.json");
const configPath = path.join(root, "src", "data", "study-vault.json");
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
const sourceFlag = process.argv.indexOf("--source");
const documentPath = path.resolve(
    sourceFlag === -1
        ? settings.document ?? path.join(localDir, "游戏研发与团队协作白皮书.html")
        : process.argv[sourceFlag + 1],
);
if (!(await stat(documentPath)).isFile() || path.extname(documentPath).toLowerCase() !== ".html") {
    throw new Error("Study source must be the single self-contained whitepaper HTML file.");
}
const bytes = await readFile(documentPath);
const html = bytes.toString("utf8");
if (!/<!doctype html>/i.test(html) || !html.includes("</html>")) throw new Error("Incomplete whitepaper HTML.");
const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
if (!title) throw new Error("Whitepaper title is required.");
const filename = path.basename(documentPath);
const salt = randomBytes(32);
const iterations = 600000;
const key = pbkdf2Sync(settings.password, salt, iterations, 32, "sha256");
const buildId = randomBytes(12).toString("hex");
const vaultRoot = path.join(root, "public", "media", "study-vault");
const destination = path.join(vaultRoot, buildId);
await mkdir(destination, { recursive: true });

async function encrypt(payload) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(payload), cipher.final()]);
    const encrypted = Buffer.concat([iv, body, cipher.getAuthTag()]);
    const check = createDecipheriv("aes-256-gcm", key, iv);
    check.setAuthTag(encrypted.subarray(-16));
    const decoded = Buffer.concat([check.update(encrypted.subarray(12, -16)), check.final()]);
    if (!decoded.equals(payload)) throw new Error("Encryption round-trip failed.");
    const name = createHash("sha256").update(encrypted).digest("hex") + ".bin";
    await writeFile(path.join(destination, name), encrypted);
    return name;
}

const chunks = [];
const chunkSize = 8 * 1024 * 1024;
for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const part = bytes.subarray(offset, offset + chunkSize);
    chunks.push({ name: await encrypt(part), size: part.length });
}
const manifest = {
    version: 1,
    originalCount: 1,
    files: {
        [filename]: {
            size: bytes.length,
            mime: "text/html; charset=utf-8",
            sha256: createHash("sha256").update(bytes).digest("hex"),
            chunks,
            title,
        },
    },
    topics: {
        production: {
            first: filename,
            documents: [{ path: filename, title, folder: "", format: "HTML" }],
        },
    },
};
const index = await encrypt(Buffer.from(JSON.stringify(manifest)));
const config = { version: 1, buildId, salt: salt.toString("base64"), iterations, index, assetRoot: `media/study-vault/${buildId}/` };
settings.document = documentPath;
await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
await writeFile(configPath + ".tmp", JSON.stringify(config, null, 2) + "\n");
await rename(configPath + ".tmp", configPath);
await writeFile(path.join(localDir, "访问说明.txt"), `游戏研发与团队协作白皮书\n\n资料密码：${settings.password}\n网站入口：https://zhuqing.tech/blog/study/\n完整文件：${documentPath}\n\n网页与下载使用同一个自包含 HTML。\n修改此文件后运行 node scripts/prepare-study-library.mjs，再构建网站。\n密码与明文保存在本地 .private-study 目录。\n`);

// Remove only generated vault directories after resolving their workspace paths.
const resolvedRoot = await realpath(vaultRoot);
for (const entry of await readdir(resolvedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{24}$/.test(entry.name) || entry.name === buildId) continue;
    const obsolete = path.join(resolvedRoot, entry.name);
    const resolved = await realpath(obsolete);
    if (resolved !== obsolete || path.dirname(resolved) !== resolvedRoot) throw new Error("Unexpected old vault location.");
    await rm(resolved, { recursive: true });
}
console.log(`Packaged and round-trip verified one whitepaper, ${bytes.length} bytes.`);
console.log(`Encrypted payloads: public/media/study-vault/${buildId}`);
console.log("Password and plaintext remain in the ignored .private-study directory.");
