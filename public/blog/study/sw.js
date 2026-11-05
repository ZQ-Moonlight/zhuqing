/* This worker decrypts requested study files in memory after a reader unlocks them. */
const sessions = new Map();
const restoring = new Map();
const scopePath = new URL(self.registration.scope).pathname;
const contentPrefix = scopePath + "_content/";
const decoder = new TextDecoder();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
    event.waitUntil((async () => {
        const port = event.ports[0];
        try {
            if (event.data.type === "lock") {
                sessions.delete(event.data.session);
                port?.postMessage({ ok: true });
                return;
            }
            if (event.data.type !== "unlock") return;
            const state = await createSession(event.data);
            port?.postMessage({ ok: true, topics: state.manifest.topics });
        } catch (error) {
            port?.postMessage({ ok: false, error: error.name === "OperationError" ? "password" : "load" });
        }
    })());
});

async function createSession({ session, key, config, assetRoot, expiresAt }) {
    if (!/^[a-f0-9-]{36}$/.test(session) || expiresAt <= Date.now()) throw new Error("Session expired.");
    const root = new URL(assetRoot, self.location.origin);
    if (root.origin !== self.location.origin) throw new Error("Invalid asset origin.");
    const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    const state = { key: cryptoKey, root, expiresAt, cache: new Map(), cacheBytes: 0 };
    const index = await decryptChunk(state, config.index);
    state.manifest = JSON.parse(decoder.decode(index));
    if (state.manifest.version !== 1) throw new Error("Unsupported library format.");
    sessions.set(session, state);
    return state;
}

async function restoreFromReader(session) {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const readers = clients.filter((client) => client.url.startsWith(self.registration.scope) && !new URL(client.url).pathname.startsWith(contentPrefix));
    try {
        const data = await Promise.any(readers.map((client) => new Promise((resolve, reject) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => { channel.port1.close(); reject(); }, 2000);
            channel.port1.onmessage = ({ data }) => {
                clearTimeout(timer);
                channel.port1.close();
                if (data?.session === session) resolve(data);
                else reject();
            };
            client.postMessage({ type: "study-restore", session }, [channel.port2]);
        })));
        return await createSession(data);
    } catch {
        return null;
    }
}

async function getSession(id) {
    const current = sessions.get(id);
    if (current?.expiresAt > Date.now()) return current;
    sessions.delete(id);
    if (!restoring.has(id)) restoring.set(id, restoreFromReader(id).finally(() => restoring.delete(id)));
    return restoring.get(id);
}

async function decryptChunk(state, name) {
    if (state.cache.has(name)) return state.cache.get(name);
    const response = await fetch(new URL(name, state.root), { cache: "no-store" });
    if (!response.ok) throw new Error("Encrypted file could not be loaded.");
    const encrypted = new Uint8Array(await response.arrayBuffer());
    const decoded = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: encrypted.slice(0, 12) }, state.key, encrypted.slice(12),
    ));
    // Keep a bounded cache for repeated video range and thumbnail requests.
    while (state.cacheBytes + decoded.byteLength > 24 * 1024 * 1024 && state.cache.size) {
        const oldest = state.cache.keys().next().value;
        state.cacheBytes -= state.cache.get(oldest).byteLength;
        state.cache.delete(oldest);
    }
    state.cache.set(name, decoded);
    state.cacheBytes += decoded.byteLength;
    return decoded;
}

function parseRange(header, size) {
    if (!header) return { start: 0, end: size - 1, partial: false };
    const match = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!match || (!match[1] && !match[2])) return null;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
    return { start, end, partial: true };
}

async function readBytes(state, entry, start, end) {
    const parts = [];
    let offset = 0;
    for (const chunk of entry.chunks) {
        const last = offset + chunk.size - 1;
        if (last >= start && offset <= end) {
            const data = await decryptChunk(state, chunk.name);
            parts.push(data.subarray(Math.max(0, start - offset), Math.min(chunk.size, end - offset + 1)));
        }
        offset += chunk.size;
        if (offset > end) break;
    }
    const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offsetOut = 0;
    for (const part of parts) {
        output.set(part, offsetOut);
        offsetOut += part.length;
    }
    return output;
}

function rangeStream(state, entry, start, end) {
    let index = 0;
    let offset = 0;
    return new ReadableStream({
        async pull(controller) {
            while (index < entry.chunks.length) {
                const chunk = entry.chunks[index++];
                const first = offset;
                offset += chunk.size;
                if (offset <= start) continue;
                const bytes = await decryptChunk(state, chunk.name);
                controller.enqueue(bytes.subarray(Math.max(0, start - first), Math.min(chunk.size, end - first + 1)));
                if (offset > end || index === entry.chunks.length) controller.close();
                return;
            }
            controller.close();
        },
        cancel() { index = entry.chunks.length; },
    });
}

function protectedHeaders() {
    return new Headers({
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Referrer-Policy": "no-referrer",
    });
}

async function serveContent(request) {
    const url = new URL(request.url);
    const parts = url.pathname.slice(contentPrefix.length).split("/");
    const state = await getSession(parts.shift());
    const headers = protectedHeaders();
    if (!state || state.expiresAt <= Date.now()) return new Response("请返回资料库重新解锁。", { status: 401, headers });
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers });
    let relative;
    try { relative = decodeURIComponent(parts.join("/")); }
    catch { return new Response(null, { status: 400, headers }); }
    if (!Object.hasOwn(state.manifest.files, relative)) return new Response("资料不存在。", { status: 404, headers });
    const original = state.manifest.files[relative];
    const download = url.searchParams.has("download");
    const entry = !download && original.view ? original.view : original;
    const isHtml = !download && entry.mime.startsWith("text/html");
    const range = parseRange(isHtml ? null : request.headers.get("Range"), entry.size);
    if (!range) {
        headers.set("Content-Range", `bytes */${entry.size}`);
        return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Type", entry.mime);
    headers.set("Accept-Ranges", "bytes");
    if (download) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(relative.split("/").pop())}`);
    if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${entry.size}`);
    if (!isHtml) {
        headers.set("Content-Length", String(range.end - range.start + 1));
        return new Response(request.method === "HEAD" ? null : rangeStream(state, entry, range.start, range.end), { status: range.partial ? 206 : 200, headers });
    }
    let bytes = await readBytes(state, entry, range.start, range.end);
    if (isHtml) {
        const assets = `<link rel="stylesheet" href="${scopePath}frame.css"><script defer src="${scopePath}frame.js?v=20261105-2"></script>`;
        let html = decoder.decode(bytes);
        html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, assets + "</head>") : html.replace(/<!doctype html>/i, "<!doctype html>" + assets);
        html = html.replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy"');
        html = html.replace(/(<video\b[^>]*\bpreload=)["']metadata["']/gi, '$1"none"');
        bytes = new TextEncoder().encode(html);
    }
    headers.set("Content-Length", String(bytes.byteLength));
    return new Response(request.method === "HEAD" ? null : bytes, { status: range.partial ? 206 : 200, headers });
}

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(contentPrefix)) return;
    event.respondWith(serveContent(event.request).catch(() => new Response("资料读取失败，请返回资料库重试。", { status: 503, headers: protectedHeaders() })));
});
