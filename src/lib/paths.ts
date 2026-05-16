export const withBase = (path: string) => {
    if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
    const cleanPath = path.replace(/^\/+/, "");
    const base = import.meta.env.BASE_URL;
    const cleanBase = base === "/" ? "" : base.replace(/^\/+|\/+$/g, "");

    if (!cleanBase) return `/${cleanPath}`;
    if (cleanPath === cleanBase || cleanPath.startsWith(`${cleanBase}/`)) return `/${cleanPath}`;

    return `/${cleanBase}/${cleanPath}`;
};
