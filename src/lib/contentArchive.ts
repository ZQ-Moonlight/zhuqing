import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export interface ReferenceItem {
    title: string;
    href?: string;
    kind: "PDF" | "LaTeX / PDF";
    path: string;
    sizeLabel: string;
    published: boolean;
}

export interface ReferenceGroup {
    label: string;
    items: ReferenceItem[];
}

const contentRoot = path.join(process.cwd(), "src", "content", "blog");
export const MAX_PUBLIC_PDF_BYTES = 50 * 1024 * 1024;

const toPosix = (value: string) => value.split(path.sep).join("/");

const trimExtension = (value: string) => value.replace(/\.[^.]+$/, "");

const titleFromPdf = (relativePath: string, hasTexSibling: boolean) => {
    const parsed = path.posix.parse(relativePath);
    if (parsed.name === "main" && parsed.dir) {
        return parsed.dir.split("/").at(-1) ?? parsed.name;
    }
    return trimExtension(parsed.base);
};

const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export const getContentRoot = () => contentRoot;

export const encodeContentFileHref = (relativePath: string) =>
    `/blog/files/${relativePath.split("/").map(encodeURIComponent).join("/")}`;

const groupLabelFromPath = (relativePath: string) => {
    const parts = relativePath.split("/");
    if (parts.length <= 1) return "根目录";
    return parts.slice(0, -1).join(" / ");
};

export const walkContentFiles = async (dir = contentRoot): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        entries
            .filter((entry) => !entry.name.startsWith("."))
            .map(async (entry) => {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) return walkContentFiles(fullPath);
                return [fullPath];
            })
    );
    return files.flat();
};

export const getReferenceGroups = async (): Promise<ReferenceGroup[]> => {
    const files = await walkContentFiles(contentRoot);
    const relativeFiles = files.map((file) => toPosix(path.relative(contentRoot, file)));
    const texFolders = new Set(
        relativeFiles
            .filter((file) => file.toLowerCase().endsWith(".tex"))
            .map((file) => path.posix.dirname(file))
    );

    const pdfs = await Promise.all(
        relativeFiles
            .filter((file) => file.toLowerCase().endsWith(".pdf"))
            .map(async (file) => {
                const fullPath = path.join(contentRoot, ...file.split("/"));
                const fileStat = await stat(fullPath);
                const group = groupLabelFromPath(file);
                const folder = path.posix.dirname(file);
                const hasTexSibling = texFolders.has(folder);
                return {
                    group,
                    item: {
                        title: titleFromPdf(file, hasTexSibling),
                        href: fileStat.size <= MAX_PUBLIC_PDF_BYTES ? encodeContentFileHref(file) : undefined,
                        kind: hasTexSibling ? "LaTeX / PDF" : "PDF",
                        path: file,
                        sizeLabel: formatBytes(fileStat.size),
                        published: fileStat.size <= MAX_PUBLIC_PDF_BYTES,
                        mtime: fileStat.mtimeMs,
                    },
                };
            })
    );

    const grouped = new Map<string, Array<ReferenceItem & { mtime: number }>>();
    for (const entry of pdfs) {
        if (!entry) continue;
        const items = grouped.get(entry.group) ?? [];
        items.push(entry.item);
        grouped.set(entry.group, items);
    }

    return [...grouped.entries()]
        .map(([label, items]) => ({
            label,
            items: items
                .sort((a, b) => b.mtime - a.mtime || a.title.localeCompare(b.title, "zh-CN"))
                .map(({ mtime, ...item }) => item),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
};
