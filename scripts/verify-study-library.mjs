import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { pbkdf2Sync, randomUUID } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "src/data/study-vault.json"), "utf8"));
const local = JSON.parse(await readFile(path.join(root, ".private-study/settings.json"), "utf8"));
const original = await readFile(local.document);
const filename = path.basename(local.document);
const key = pbkdf2Sync(local.password, Buffer.from(config.salt, "base64"), config.iterations, 32, "sha256");
const listeners = {};
let restoreData = null;
const context = vm.createContext({
    self: {
        registration: { scope: "https://study.test/blog/study/" },
        location: { origin: "https://study.test" },
        clients: { matchAll: async () => restoreData ? [{ url: "https://study.test/blog/study/", postMessage: (message, ports) => ports[0].postMessage(restoreData) }] : [] },
        addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    crypto: globalThis.crypto, URL, Response, Headers, TextDecoder, TextEncoder, Uint8Array, ReadableStream, MessageChannel, setTimeout, clearTimeout,
    fetch: async (url) => new Response(await readFile(path.join(root, "public", decodeURIComponent(new URL(url).pathname)))),
});
vm.runInContext(await readFile(path.join(root, "public/blog/study/sw.js"), "utf8"), context);
async function message(data) {
    let result;
    let pending;
    listeners.message({ data, ports: [{ postMessage: (value) => { result = value; } }], waitUntil: (promise) => { pending = promise; } });
    await pending;
    return result;
}
function request(relative, session, options, download = false) {
    const url = new URL("https://study.test/blog/study/_content/" + session + "/" + relative.split("/").map(encodeURIComponent).join("/"));
    if (download) url.searchParams.set("download", "1");
    let response;
    listeners.fetch({ request: new Request(url, options), respondWith: (value) => { response = value; } });
    return response;
}
const session = randomUUID();
const data = { type: "unlock", session, key, config, assetRoot: "https://study.test/" + config.assetRoot, expiresAt: Date.now() + 60000 };
assert.equal((await request(filename, session)).status, 401);
assert.equal((await message({ ...data, key: new Uint8Array(32) })).ok, false);
const unlocked = await message(data);
assert.equal(unlocked.ok, true);
assert.deepEqual(Object.keys(unlocked.topics), ["production"]);
assert.equal(unlocked.topics.production.documents.length, 1);
assert.equal(unlocked.topics.production.first, filename);
const state = vm.runInContext("sessions.values().next().value", context);
assert.equal(state.manifest.originalCount, 1);
assert.deepEqual(Object.keys(state.manifest.files), [filename]);
const response = await request(filename, session);
assert.match(response.headers.get("Content-Type"), /text\/html/);
assert.match(response.headers.get("Cache-Control"), /no-store/);
assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
const download = await request(filename, session, undefined, true);
assert.match(download.headers.get("Content-Disposition"), /attachment/);
assert.deepEqual(Buffer.from(await download.arrayBuffer()), original);
for (const [header, start, end] of [["bytes=0-255", 0, 255], ["bytes=-100", original.length - 100, original.length - 1]]) {
    const partial = await request(filename, session, { headers: { Range: header } }, true);
    assert.equal(partial.status, 206);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), original.subarray(start, end + 1));
}
assert.equal((await request(filename, session, { headers: { Range: "bytes=999999999-" } }, true)).status, 416);
assert.equal((await request("missing.txt", session)).status, 404);
assert.equal((await request("游戏研发个人知识库/00_总览与学习地图.md", session)).status, 404);
restoreData = data;
vm.runInContext("sessions.clear()", context);
assert.equal((await request(filename, session)).status, 200);
restoreData = null;
await message({ type: "lock", session });
assert.equal((await request(filename, session)).status, 401);

const html = original.toString("utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length);
for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing anchor ${match[1]}`);
assert.equal((html.match(/<figure>/g) || []).length, 9);
assert.equal((html.match(/<figcaption>/g) || []).length, 9);
assert.equal((html.match(/class="chapter"/g) || []).length, 16);
assert.ok(!/<(?:img|script|link)\b[^>]*(?:src|href)="https?:/i.test(html));
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const publicPage = await readFile(path.join(root, "dist/blog/study/index.html"), "utf8");
for (const text of [local.password, "docs.popo.netease.com", "可用于持续经营的现金", filename]) assert.ok(!publicPage.includes(text));
for (const slug of ["animation-vfx", "fps-tps", "level-ui", "design-practice", "indie"]) {
    await assert.rejects(access(path.join(root, "dist/blog/study", slug, "index.html")));
}
for (const name of ["fps-tps-source.html", "frame.css", "frame.js"]) await assert.rejects(access(path.join(root, "dist/blog/study", name)));
assert.deepEqual(await readdir(path.join(root, "public/media/study-vault")), [config.buildId]);
const archive = await readFile(path.join(root, "dist/blog/index.html"), "utf8");
assert.match(archive, /游戏研发与团队协作白皮书/);
assert.ok(!archive.includes("六个专题"));
console.log("PASS: single-document manifest, byte-identical reading/download, range requests, wrong password, relock, worker restoration, anchors/figures, removed routes/assets, and public-page leak checks.");
