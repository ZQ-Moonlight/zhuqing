import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pbkdf2Sync, randomUUID } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "src/data/study-vault.json"), "utf8"));
const local = JSON.parse(await readFile(path.join(root, ".private-study/settings.json"), "utf8"));
const key = pbkdf2Sync(local.password, Buffer.from(config.salt, "base64"), config.iterations, 32, "sha256");
const listeners = {};
let restoreData = null;
const context = vm.createContext({
    self: {
        registration: { scope: "https://study.test/blog/study/" },
        location: { origin: "https://study.test" },
        clients: { matchAll: async () => restoreData ? [{ url: "https://study.test/blog/study/production/", postMessage: (message, ports) => ports[0].postMessage(restoreData) }] : [] },
        addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    crypto: globalThis.crypto, URL, Response, Headers, TextDecoder, TextEncoder, Uint8Array, ReadableStream, MessageChannel, setTimeout, clearTimeout,
    fetch: async (url) => {
        const file = path.join(root, "public", decodeURIComponent(new URL(url).pathname));
        return new Response(await readFile(file));
    },
});
vm.runInContext(await readFile(path.join(root, "public/blog/study/sw.js"), "utf8"), context);
async function message(data) {
    let result;
    let pending;
    listeners.message({ data, ports: [{ postMessage: (value) => { result = value; } }], waitUntil: (promise) => { pending = promise; } });
    await pending;
    return result;
}
function request(relative, session, options) {
    const url = "https://study.test/blog/study/_content/" + session + "/" + relative.split("/").map(encodeURIComponent).join("/");
    let response;
    listeners.fetch({ request: new Request(url, options), respondWith: (value) => { response = value; } });
    return response;
}
const session = randomUUID();
const data = { type: "unlock", session, key, config, assetRoot: "https://study.test/" + config.assetRoot, expiresAt: Date.now() + 60000 };
assert.equal((await request("secret.html", session)).status, 401);
assert.equal((await message({ ...data, key: new Uint8Array(32) })).ok, false);
assert.equal((await request("secret.html", session)).status, 401);
const unlocked = await message(data);
assert.equal(unlocked.ok, true);
assert.equal(Object.keys(unlocked.topics).length, 5);
const markdown = unlocked.topics.production.first;
const html = await request(markdown, session);
assert.match(html.headers.get("Content-Type"), /text\/html/);
assert.match(html.headers.get("Cache-Control"), /no-store/);
assert.match(await html.text(), /prose-grid/);
assert.equal((await request("missing.txt", session)).status, 404);

const videoPath = "S18专业设计图文摘录_v3_动画与特效深入_2026-10-26/原图/taweek_581.mp4";
const original = await readFile(path.join(local.source, videoPath));
for (const [header, start, end] of [
    ["bytes=0-255", 0, 255],
    ["bytes=8388590-8388630", 8388590, 8388630],
    ["bytes=-100", original.length - 100, original.length - 1],
]) {
    const response = await request(videoPath, session, { headers: { Range: header } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), `bytes ${start}-${end}/${original.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), original.subarray(start, end + 1));
}
assert.equal((await request(videoPath, session, { headers: { Range: "bytes=999999999-" } })).status, 416);
// Browsers routinely terminate idle workers. A still-open reader can restore its key.
restoreData = data;
vm.runInContext("sessions.clear()", context);
assert.equal((await request(markdown, session)).status, 200);
restoreData = null;
await message({ type: "lock", session });
assert.equal((await request(videoPath, session)).status, 401);

const protectedPage = await readFile(path.join(root, "dist/blog/study/production/index.html"), "utf8");
assert.ok(!protectedPage.includes(local.password));
assert.ok(!protectedPage.includes("docs.popo.netease.com"));
assert.ok(!protectedPage.includes("00_总览与学习地图.md"));
const indexPage = await readFile(path.join(root, "dist/blog/study/index.html"), "utf8");
assert.ok(!indexPage.includes(local.password));
console.log("PASS: locked access, wrong password, decryption, rendered Markdown, missing files, video ranges across chunks, invalid range, relock, and public HTML leak checks.");
