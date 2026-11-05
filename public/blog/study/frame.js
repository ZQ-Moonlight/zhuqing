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
    // CommonMark leaves some punctuation-ending Chinese bold labels as literal text.
    document.querySelectorAll(".study-prose article p, .study-prose article li, .study-prose article td").forEach((paragraph) => {
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
            if (node.parentElement.closest("pre, code")) continue;
            const text = node.textContent;
            const matches = [...text.matchAll(/\*\*([^*\n]+[：:，,；;。.!?！？])\*\*(?=[\p{L}\p{N}])/gu)];
            if (!matches.length) continue;
            const fragment = document.createDocumentFragment();
            let offset = 0;
            for (const match of matches) {
                const strong = document.createElement("strong");
                strong.textContent = match[1];
                fragment.append(text.slice(offset, match.index), strong);
                offset = match.index + match[0].length;
            }
            fragment.append(text.slice(offset));
            node.replaceWith(fragment);
        }
    });
    window.addEventListener("message", (event) => {
        if (event.source !== window.parent || event.origin !== location.origin) return;
        if (event.data?.type === "study-theme") document.documentElement.dataset.theme = event.data.theme;
    });
    window.parent.postMessage({ type: "study-loaded", title: document.title }, location.origin);
})();
