import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
    loader: glob({
        pattern: "**/*.md",
        base: "./src/content/blog",
        generateId: ({ entry }) => entry.replace(/\/index\.md$/, "").replace(/\.md$/, ""),
    }),
    schema: ({ image }) => z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        pubDate: z.coerce.date().optional(),
        updatedDate: z.coerce.date().optional(),
        heroImage: z.union([image(), z.string()]).optional(),
        pdfUrl: z.string().optional(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
        privateArchive: z.boolean().default(false),
    }),
});

export const collections = { blog };
