import { readFile, stat } from "node:fs/promises";
import nodePath from "node:path";
import type { APIRoute, GetStaticPaths } from "astro";
import { getContentRoot, MAX_PUBLIC_PDF_BYTES, walkContentFiles } from "../../../lib/contentArchive";

const toPosix = (value: string) => value.split(nodePath.sep).join("/");

export const getStaticPaths: GetStaticPaths = async () => {
    const root = getContentRoot();
    const files = await walkContentFiles(root);

    const pdfs = await Promise.all(
        files
            .map((file) => ({
                fullPath: file,
                relativePath: toPosix(nodePath.relative(root, file)),
            }))
            .filter(({ relativePath }) => relativePath.toLowerCase().endsWith(".pdf"))
            .map(async ({ fullPath, relativePath }) => ({
                relativePath,
                size: (await stat(fullPath)).size,
            }))
    );

    return pdfs
        .filter((file) => file.size <= MAX_PUBLIC_PDF_BYTES)
        .map((file) => ({ params: { path: file.relativePath } }));
};

export const GET: APIRoute = async ({ params }) => {
    const root = getContentRoot();
    const relativePath = params.path ?? "";
    const fullPath = nodePath.resolve(root, ...relativePath.split("/"));

    if (!fullPath.startsWith(nodePath.resolve(root)) || !fullPath.toLowerCase().endsWith(".pdf")) {
        return new Response("Not found", { status: 404 });
    }

    const fileStat = await stat(fullPath);

    if (fileStat.size > MAX_PUBLIC_PDF_BYTES) {
        return new Response("Not found", { status: 404 });
    }

    const file = await readFile(fullPath);
    const filename = nodePath.basename(fullPath);

    return new Response(file, {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
    });
};
