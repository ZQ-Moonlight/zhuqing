import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

const escapeXml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

const formatDate = (date?: Date) => date?.toISOString().split("T")[0];

export const GET: APIRoute = async ({ site }) => {
    const baseUrl = new URL(import.meta.env.BASE_URL, site ?? "https://zq-moonlight.github.io");
    const blogPosts = await getCollection("blog", ({ data }) => !data.draft && !data.privateArchive);
    const portfolioItems = await getCollection("portfolio");

    const staticRoutes = [
        { path: "", priority: "1.0" },
        { path: "portfolio/", priority: "0.9" },
        { path: "portfolio/detroit/", priority: "0.8" },
        { path: "blog/", priority: "0.8" },
    ];

    const urls = [
        ...staticRoutes,
        ...portfolioItems.map((item) => ({
            path: `portfolio/${item.id}/`,
            lastmod: formatDate(item.data.pubDate),
            priority: "0.8",
        })),
        ...blogPosts.map((post) => ({
            path: `blog/${post.id}/`,
            lastmod: formatDate(post.data.updatedDate ?? post.data.pubDate),
            priority: "0.7",
        })),
    ];

    const entries = urls
        .map(({ path, lastmod, priority }) => {
            const loc = new URL(path, baseUrl).toString();
            return [
                "    <url>",
                `        <loc>${escapeXml(loc)}</loc>`,
                lastmod ? `        <lastmod>${lastmod}</lastmod>` : "",
                `        <priority>${priority}</priority>`,
                "    </url>",
            ]
                .filter(Boolean)
                .join("\n");
        })
        .join("\n");

    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`, {
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
        },
    });
};
