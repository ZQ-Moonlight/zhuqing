(() => {
    const theme = window.parent.document.documentElement.dataset.theme || "dark";
    document.documentElement.dataset.theme = theme;
    document.body.classList.add("study-frame");
    document.addEventListener("click", (event) => {
        const locator = event.target.closest?.(".locate[data-media]");
        if (!locator) return;
        const video = document.getElementById("visual-" + locator.dataset.media);
        if (video?.tagName === "VIDEO" && video.readyState === 0) {
            video.preload = "metadata";
            video.load();
        }
    }, { capture: true });
    const contents = document.querySelector(".prose-toc");
    if (contents) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "本篇目录";
        contents.querySelector("strong")?.remove();
        details.append(summary, ...contents.childNodes);
        contents.append(details);
        const wide = window.matchMedia("(min-width: 1001px)");
        details.open = wide.matches;
        wide.addEventListener("change", () => { details.open = wide.matches; });
    }
    document.querySelectorAll('a[href^="http"]').forEach((link) => {
        if (new URL(link.href).origin !== location.origin) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
    });
    document.querySelectorAll("table").forEach((table) => {
        if (table.parentElement.classList.contains("table-wrap")) return;
        const wrap = document.createElement("div");
        wrap.className = "table-wrap";
        table.replaceWith(wrap);
        wrap.append(table);
    });
    window.addEventListener("message", (event) => {
        if (event.source !== window.parent || event.origin !== location.origin) return;
        if (event.data?.type === "study-theme") document.documentElement.dataset.theme = event.data.theme;
    });
    window.parent.postMessage({ type: "study-loaded", title: document.title }, location.origin);
})();
