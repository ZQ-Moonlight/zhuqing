import { readFile, stat } from "node:fs/promises";
import nodePath from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import { getContentRoot, walkContentFiles } from "./contentArchive";

const IMAGE_MIME_TYPES = new Map([
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".webp", "image/webp"],
    [".gif", "image/gif"],
]);

const toPosix = (value: string) => value.split(nodePath.sep).join("/");

export const createContentAssetRoute = (assetFolder: string) => {
    const getStaticPaths: GetStaticPaths = async () => {
        const root = nodePath.resolve(getContentRoot(), assetFolder);
        const files = await walkContentFiles(root).catch(() => []);

        return files
            .map((file) => toPosix(nodePath.relative(root, file)))
            .filter((relativePath) => IMAGE_MIME_TYPES.has(nodePath.extname(relativePath).toLowerCase()))
            .map((relativePath) => ({ params: { path: relativePath } }));
    };

    const GET: APIRoute = async ({ params }) => {
        const root = nodePath.resolve(getContentRoot(), assetFolder);
        const relativePath = params.path ?? "";
        const fullPath = nodePath.resolve(root, ...relativePath.split("/"));
        const extension = nodePath.extname(fullPath).toLowerCase();
        const mimeType = IMAGE_MIME_TYPES.get(extension);

        if (!fullPath.startsWith(root) || !mimeType) {
            return new Response("Not found", { status: 404 });
        }

        const fileStat = await stat(fullPath);
        if (!fileStat.isFile()) {
            return new Response("Not found", { status: 404 });
        }

        const file = await readFile(fullPath);

        return new Response(file, {
            headers: {
                "Content-Type": mimeType,
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    };

    return { getStaticPaths, GET };
};
