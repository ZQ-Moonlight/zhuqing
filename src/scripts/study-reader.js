const reader = document.querySelector("[data-study-reader]");
if (reader) initializeReader(reader);

function initializeReader(root) {
    const frame = root.querySelector("[data-study-frame]");
    const workspace = root.querySelector("[data-workspace]");
    const focusButton = root.querySelector("[data-focus-toggle]");
    const readerStatus = root.querySelector("[data-reader-status]");
    const isProtected = root.dataset.protected === "true";
    const config = JSON.parse(root.dataset.config);
    const base = new URL(root.dataset.base, location.origin);
    const scope = new URL("blog/study/", base);
    const storageKey = "zq-study-session-" + config.buildId;
    let session;
    let worker;

    focusButton.addEventListener("click", () => {
        const focused = root.classList.toggle("is-focused");
        focusButton.textContent = focused ? "退出专注" : "专注阅读";
        focusButton.setAttribute("aria-pressed", String(focused));
    });
    const themeObserver = new MutationObserver(() => {
        frame.contentWindow?.postMessage({ type: "study-theme", theme: document.documentElement.dataset.theme }, location.origin);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("message", (event) => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === "study-loaded") readerStatus.textContent = "";
    });
    if (!isProtected) return;

    const unlockPanel = root.querySelector("[data-unlock-panel]");
    const form = root.querySelector("[data-unlock-form]");
    const input = form.querySelector("input");
    const button = form.querySelector("button");
    const status = root.querySelector("[data-unlock-status]");
    const select = root.querySelector("[data-document-select]");
    const download = root.querySelector("[data-download]");

    navigator.serviceWorker?.addEventListener("message", (event) => {
        if (event.data?.type !== "study-restore") return;
        const active = session?.id === event.data.session && session.expiresAt > Date.now();
        event.ports[0]?.postMessage(active ? {
            session: session.id,
            key: Uint8Array.from(atob(session.key), (c) => c.charCodeAt(0)),
            config,
            assetRoot: new URL(config.assetRoot, base).href,
            expiresAt: session.expiresAt,
        } : null);
    });

    async function getWorker() {
        if (!window.isSecureContext || !("serviceWorker" in navigator)) throw new Error("browser");
        const registration = await navigator.serviceWorker.register(new URL("sw.js", scope), { scope: scope.pathname, updateViaCache: "none" });
        await navigator.serviceWorker.ready;
        const active = registration.installing || registration.waiting || registration.active;
        if (active.state !== "activated") {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("worker")), 15000);
                active.addEventListener("statechange", () => {
                    if (active.state === "activated") { clearTimeout(timer); resolve(); }
                    if (active.state === "redundant") { clearTimeout(timer); reject(new Error("worker")); }
                });
            });
        }
        return registration.active;
    }

    function send(message) {
        return new Promise((resolve, reject) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => { channel.port1.close(); reject(new Error("load")); }, 30000);
            channel.port1.onmessage = ({ data }) => {
                clearTimeout(timer);
                channel.port1.close();
                if (data.ok) resolve(data);
                else reject(new Error(data.error));
            };
            worker.postMessage(message, [channel.port2]);
        });
    }

    function fileUrl(name) {
        return new URL("_content/" + session.id + "/" + name.split("/").map(encodeURIComponent).join("/"), scope);
    }

    function showDocument() {
        const url = fileUrl(select.value);
        readerStatus.textContent = "正在打开文档…";
        frame.src = url.href;
        const original = new URL(url);
        original.searchParams.set("download", "1");
        download.href = original.href;
        download.setAttribute("download", select.value.split("/").pop());
    }

    async function unlock(saved) {
        worker = await getWorker();
        const key = Uint8Array.from(atob(saved.key), (c) => c.charCodeAt(0));
        const result = await send({ type: "unlock", session: saved.id, key, config, assetRoot: new URL(config.assetRoot, base).href, expiresAt: saved.expiresAt });
        const topic = result.topics[root.dataset.topic];
        if (!topic) throw new Error("load");
        session = saved;
        select.replaceChildren();
        for (const doc of topic.documents) {
            const option = document.createElement("option");
            option.value = doc.path;
            option.textContent = (doc.folder ? doc.folder + " / " : "") + doc.title;
            select.append(option);
        }
        select.value = topic.first;
        try { sessionStorage.setItem(storageKey, JSON.stringify(saved)); } catch {}
        unlockPanel.hidden = true;
        workspace.hidden = false;
        input.value = "";
        showDocument();
    }

    select.addEventListener("change", showDocument);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        button.disabled = true;
        status.textContent = "正在解锁资料…";
        try {
            const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.value), "PBKDF2", false, ["deriveBits"]);
            const salt = Uint8Array.from(atob(config.salt), (c) => c.charCodeAt(0));
            const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: config.iterations, hash: "SHA-256" }, material, 256);
            const key = btoa(String.fromCharCode(...new Uint8Array(bits)));
            await unlock({ id: crypto.randomUUID(), key, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
            status.textContent = "";
        } catch (error) {
            status.textContent = error.message === "password" ? "密码有误，请重新输入。" : error.message === "browser" ? "请使用支持安全连接的现代浏览器打开此页面。" : "资料加载失败，请检查网络后重试。";
            input.focus();
        } finally {
            button.disabled = false;
        }
    });

    root.querySelector("[data-lock]").addEventListener("click", async () => {
        frame.removeAttribute("src");
        frame.src = "about:blank";
        workspace.hidden = true;
        unlockPanel.hidden = false;
        root.classList.remove("is-focused");
        focusButton.textContent = "专注阅读";
        focusButton.setAttribute("aria-pressed", "false");
        try { sessionStorage.removeItem(storageKey); } catch {}
        const lockedSession = session;
        session = null;
        if (lockedSession && worker) await send({ type: "lock", session: lockedSession.id }).catch(() => {});
        select.replaceChildren();
        status.textContent = "资料已锁定。";
        input.focus();
    });

    try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (saved?.expiresAt > Date.now()) {
            status.textContent = "正在恢复本次阅读…";
            unlock(saved).catch(() => { status.textContent = "请重新输入资料密码。"; });
        }
    } catch {}
}
