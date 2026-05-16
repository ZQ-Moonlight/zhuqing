export const withBase = (path: string) => {
    if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
    const base = import.meta.env.BASE_URL;
    if (path.startsWith(base)) return path;
    return `${base}${path.replace(/^\/+/, "")}`;
};
