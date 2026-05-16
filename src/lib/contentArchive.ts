import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { withBase } from "./paths";

export interface ReferenceItem {
    title: string;
    description?: string;
    href?: string;
    kind: "PDF" | "LaTeX / PDF";
    path: string;
    sizeLabel: string;
    published: boolean;
    tags: string[];
    uploadedLabel: string;
}

export interface ReferenceGroup {
    label: string;
    items: ReferenceItem[];
}

const contentRoot = path.join(process.cwd(), "src", "content", "blog");
export const MAX_PUBLIC_PDF_BYTES = 50 * 1024 * 1024;

const toPosix = (value: string) => value.split(path.sep).join("/");

const trimExtension = (value: string) => value.replace(/\.[^.]+$/, "");

const referenceMetadata: Record<
    string,
    {
        title?: string;
        description?: string;
        tags?: string[];
        uploadedDate?: string;
    }
> = {
    "reel/DIT快速入门手册_V1.1.pdf": {
        title: "DIT 快速入门手册 V1.1",
        description: "面向片场素材管理、转码、校验、备份与数据交接的 DIT 工作流手册。",
        tags: ["DIT", "Workflow", "Set Data"],
        uploadedDate: "2026-02-25",
    },
    "reel/影像册_V1.pdf": {
        title: "影像册 V1",
        description: "以摄影作品为主体的阶段性影像合集，用于展示画面观察、叙事气质与视觉整理能力。",
        tags: ["Photography", "Reel", "Portfolio"],
        uploadedDate: "2025-05-07",
    },
};

const titleFromPdf = (relativePath: string, hasTexSibling: boolean) => {
    const metadataTitle = referenceMetadata[relativePath]?.title;
    if (metadataTitle) return metadataTitle;

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

const formatDateLabel = (date: Date) =>
    new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);

const metadataForFile = (relativePath: string, fallbackDate: Date, kind: ReferenceItem["kind"]) => {
    const metadata = referenceMetadata[relativePath] ?? {};
    const folder = path.posix.dirname(relativePath);
    const fallbackTags = [folder === "." ? "Archive" : folder.split("/").at(-1) ?? "Archive", kind];

    return {
        description: metadata.description,
        tags: metadata.tags ?? fallbackTags,
        uploadedLabel: formatDateLabel(metadata.uploadedDate ? new Date(metadata.uploadedDate) : fallbackDate),
    };
};

export const getContentRoot = () => contentRoot;

export const encodeContentFileHref = (relativePath: string) =>
    withBase(`/blog/files/${relativePath.split("/").map(encodeURIComponent).join("/")}`);

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
                const kind = hasTexSibling ? "LaTeX / PDF" : "PDF";
                const metadata = metadataForFile(file, fileStat.mtime, kind);

                return {
                    group,
                    item: {
                        title: titleFromPdf(file, hasTexSibling),
                        description: metadata.description,
                        href: fileStat.size <= MAX_PUBLIC_PDF_BYTES ? encodeContentFileHref(file) : undefined,
                        kind,
                        path: file,
                        sizeLabel: formatBytes(fileStat.size),
                        published: fileStat.size <= MAX_PUBLIC_PDF_BYTES,
                        tags: metadata.tags,
                        uploadedLabel: metadata.uploadedLabel,
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
